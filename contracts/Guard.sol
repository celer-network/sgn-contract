pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "./lib/interface/IGuard.sol";

contract Guard is IGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    enum MathOperation { Add, Sub }

    // Unbonded: not a validator and not responsible for previous validator behaviors if any.
    //   Delegators now are free to withdraw stakes (directly).
    // Bonded: active validator. Delegators has to wait for blameTimeout to withdraw stakes.
    // Unbonding: transitional status from Bonded to Unbonded. Candidate has lost the right of
    //   validator but is still responsible for any misbehavors done during being validator.
    //   Delegators should wait until candidate's unbondTime to freely withdraw stakes.
    enum CandidateStatus { Unbonded, Bonded, Unbonding }

    struct WithdrawIntent {
        uint amount;
        uint unlockTime;
    }

    struct Delegator {
        uint stake;
        WithdrawIntent[] withdrawIntents;
        uint nextWithdrawIntent;
    }

    struct ValidatorCandidate {
        bool initialized;
        uint minSelfStake;
        bytes sidechainAddr;

        uint totalStake;
        // TODO: do we need address[] delegators?
        mapping (address => Delegator) delegatorProfiles;
        CandidateStatus status;
        uint unbondTime;
    }

    uint public constant VALIDATOR_SET_MAX_SIZE = 11;

    IERC20 public celerToken;
    // subscription fee per block
    uint public feePerBlock;
    // timeout to blame (claim responsibility of) unlocking delegators or unbonding validators
    uint public blameTimeout;
    uint public minValidatorNum;
    // used for bootstrap: there should be enough time for delegating and
    // claim the initial validators
    uint public sidechainGoLive;
    // universal requirement for minimum total stake of each validator
    uint public minTotalStake;

    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;
    // consumer subscription
    mapping (address => uint) public subscriptionExpiration;

    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    // check this before sidechain's operation
    modifier onlyValidSidechain() {
        require(getValidatorNum() >= minValidatorNum, "too few validators");
        require(block.number >= sidechainGoLive, "sidechain is not live");
        _;
    }

    constructor(
        address _celerTokenAddress,
        uint _feePerBlock,
        uint _blameTimeout,
        uint _minValidatorNum,
        uint _minTotalStake
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        feePerBlock = _feePerBlock;
        blameTimeout = _blameTimeout;
        minValidatorNum = _minValidatorNum;
        minTotalStake = _minTotalStake;
    }

    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(!candidate.initialized, "Candidate is initialized");

        candidate.initialized = true;
        candidate.minSelfStake = _minSelfStake;
        candidate.sidechainAddr = _sidechainAddr;

        emit InitializeCandidate(msg.sender, _minSelfStake, _sidechainAddr);
    }

    function delegate(address _candidateAddr, uint _amount) external onlyNonZeroAddr(_candidateAddr) {
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        require(candidate.initialized, "Candidate is not initialized");

        address msgSender = msg.sender;
        _updateStake(candidate, msgSender, _amount, MathOperation.Add);

        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit Delegate(msgSender, _candidateAddr, _amount, candidate.totalStake);
    }

    function updateSidechainAddr(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;
        require(!isValidator(msgSender), "msg.sender is validator");
        ValidatorCandidate storage candidate = candidateProfiles[msgSender];
        require(candidate.initialized, "Candidate is not initialized");
        
        bytes memory oldSidechainAddr = candidate.sidechainAddr;
        candidate.sidechainAddr = _sidechainAddr;

        emit UpdateSidechainAddr(msgSender, oldSidechainAddr, _sidechainAddr);
    }

    // TODO: function updateMinSelfStake - unlock all stakes when candidate updates this field?

    function claimValidator() external {
        address msgSender = msg.sender;
        ValidatorCandidate storage candidate = candidateProfiles[msgSender];
        require(candidate.initialized, "Candidate is not initialized");
        // TODO: decide whether Unbonding status is valid to claimValidator or not
        require(candidate.status == CandidateStatus.Unbonded);
        require(candidate.totalStake >= minTotalStake, "Not enough total stake");
        require(
            candidate.delegatorProfiles[msgSender].stake >= candidate.minSelfStake,
            "Not enough self stake"
        );

        uint minStakeIndex = 0;
        uint minStake = candidateProfiles[validatorSet[0]].totalStake;
        for (uint i = 1; i < VALIDATOR_SET_MAX_SIZE; i++) {
            require(validatorSet[i] != msgSender, "Already in validator set");
            if (candidateProfiles[validatorSet[i]].totalStake < minStake) {
                minStakeIndex = i;
                minStake = candidateProfiles[validatorSet[i]].totalStake;
            }
        }

        address removedValidator = validatorSet[minStakeIndex];
        if (removedValidator != address(0)) {
            _removeValidator(minStakeIndex);
        }
        _addValidator(msgSender, minStakeIndex);
    }

    // for withdrawing stakes of unbonded candidates
    function withdrawFromUnbondedCandidate(
        address _candidateAddr,
        uint _amount
    )
        external
        onlyNonZeroAddr(_candidateAddr)
    {
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        require(candidate.status == CandidateStatus.Unbonded);

        address msgSender = msg.sender;
        Delegator storage delegator = candidate.delegatorProfiles[msgSender];
        _updateStake(candidate, msgSender, _amount, MathOperation.Sub);

        celerToken.safeTransfer(msgSender, _amount);

        emit WithdrawFromUnbondedCandidate(msgSender, _candidateAddr, _amount);
    }

    // intendWithdraw from bonded or unbonding candidates
    function intendWithdraw(
        address _candidateAddr,
        uint _amount
    )
        external
        onlyNonZeroAddr(_candidateAddr)
    {
        address msgSender = msg.sender;
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        Delegator storage delegator = candidate.delegatorProfiles[msgSender];

        _updateStake(candidate, msgSender, _amount, MathOperation.Sub);
        
        WithdrawIntent memory withdrawIntent;
        withdrawIntent.amount = _amount;
        if (candidate.status == CandidateStatus.Bonded) {
            bool lowSelfStake = 
                _candidateAddr == msgSender && delegator.stake < candidate.minSelfStake;
            bool lowTotalStake = candidate.totalStake < minTotalStake;
            
            if (lowSelfStake || lowTotalStake) {
                _removeValidator(_getValidatorIdx(_candidateAddr));
            }

            withdrawIntent.unlockTime = block.timestamp.add(blameTimeout);
        } else if (candidate.status == CandidateStatus.Unbonding) {
            // no need to wait another blameTimeout
            withdrawIntent.unlockTime = candidate.unbondTime;
        } else {
            revert("Candidate status is not Bonded or Unbonding");
        }

        delegator.withdrawIntents.push(withdrawIntent);
        emit IntendWithdraw(
            msgSender,
            _candidateAddr,
            _amount,
            withdrawIntent.unlockTime,
            candidate.totalStake
        );
    }

    function confirmWithdraw(address _candidateAddr) external onlyNonZeroAddr(_candidateAddr) {
        address msgSender = msg.sender;
        Delegator storage delegator =
            candidateProfiles[_candidateAddr].delegatorProfiles[msgSender];

        uint intentLen = delegator.withdrawIntents.length;
        uint ts = block.timestamp;
        uint withdrawAmount = 0;
        for (uint i = delegator.nextWithdrawIntent; i < intentLen; i++) {
            if (ts > delegator.withdrawIntents[i].unlockTime) {
                withdrawAmount = withdrawAmount.add(delegator.withdrawIntents[i].amount);
            } else {
                delegator.nextWithdrawIntent = i;
                break;
            }
        }
        celerToken.safeTransfer(msgSender, withdrawAmount);

        emit ConfirmWithdraw(msgSender, _candidateAddr, withdrawAmount);
    }

    function subscribe(uint _amount) external {
        address msgSender = msg.sender;
        uint delta = _amount.div(feePerBlock);

        if (subscriptionExpiration[msgSender] < block.number) {
            subscriptionExpiration[msgSender] = block.number.add(delta);
        }
        else {
            subscriptionExpiration[msgSender] = subscriptionExpiration[msgSender].add(delta);
        }
        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit Subscription(msgSender, _amount, subscriptionExpiration[msgSender]);
    }

    // TODO
    // function punish(bytes calldata _punishRequest) external onlyValidSidechain {
        // think about punish protobuf message
        // sidechain claims which delegators of a validator will be punished by what amount
    // }

    function isValidator(address _addr) public view returns (bool) {
        return candidateProfiles[_addr].status == CandidateStatus.Bonded;
    }

    function getValidatorNum() public view returns (uint) {
        uint num = 0;
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] != address(0)) {
                num++;
            }
        }
        return num;
    }

    function getMinStake() public view returns (uint) {
        uint minStake = candidateProfiles[validatorSet[0]].totalStake;

        for (uint i = 1; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (minStake == 0) {
                break;
            }

            if (candidateProfiles[validatorSet[i]].totalStake < minStake) {
                minStake = candidateProfiles[validatorSet[i]].totalStake;
            }
        }

        return minStake;
    }

    function getCandidateInfo(address _candidateAddr) public view returns (
        bool initialized,
        uint minSelfStake,
        bytes memory sidechainAddr,
        uint totalStake,
        bool isVldt
    )
    {
        ValidatorCandidate storage c = candidateProfiles[_candidateAddr];

        initialized = c.initialized;
        minSelfStake = c.minSelfStake;
        sidechainAddr = c.sidechainAddr;
        totalStake = c.totalStake;
        isVldt = isValidator(_candidateAddr);
    }

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) public view
        returns (
        uint stake,
        uint[] memory intentAmounts,
        uint[] memory intentUnlockTimes,
        uint nextWithdrawIntent
    )
    {
        Delegator storage d = candidateProfiles[_candidateAddr].delegatorProfiles[_delegatorAddr];

        uint len = d.withdrawIntents.length;
        intentAmounts = new uint[](len);
        intentUnlockTimes = new uint[](len);
        for (uint i = 0; i < d.withdrawIntents.length; i++) {
            intentAmounts[i] = d.withdrawIntents[i].amount;
            intentUnlockTimes[i] = d.withdrawIntents[i].unlockTime;
        }

        stake = d.stake;
        nextWithdrawIntent = d.nextWithdrawIntent;
    }

    function _updateStake(
        ValidatorCandidate storage _candidate,
        address _delegatorAddr,
        uint _amount,
        MathOperation _op
    )
        private
    {
        if (_op == MathOperation.Add) {
            _candidate.delegatorProfiles[_delegatorAddr].stake =
                _candidate.delegatorProfiles[_delegatorAddr].stake.add(_amount);
            _candidate.totalStake = _candidate.totalStake.add(_amount);
        } else if (_op == MathOperation.Sub) {
            _candidate.delegatorProfiles[_delegatorAddr].stake =
                _candidate.delegatorProfiles[_delegatorAddr].stake.sub(_amount);
            _candidate.totalStake = _candidate.totalStake.sub(_amount);
        } else {
            assert(false);
        }
    }

    function _addValidator(address _validatorAddr, uint _setIndex) private {
        require(validatorSet[_setIndex] == address(0));

        validatorSet[_setIndex] = _validatorAddr;
        candidateProfiles[_validatorAddr].status = CandidateStatus.Bonded;
        delete candidateProfiles[_validatorAddr].unbondTime;
        emit ValidatorChange(_validatorAddr, ValidatorChangeType.Add);
    }

    function _removeValidator(uint _setIndex) private {
        address removedValidator = validatorSet[_setIndex];
        if (removedValidator == address(0)) {
            return;
        }

        delete validatorSet[_setIndex];
        candidateProfiles[removedValidator].status = CandidateStatus.Unbonding;
        candidateProfiles[removedValidator].unbondTime = block.timestamp.add(blameTimeout);
        emit ValidatorChange(removedValidator, ValidatorChangeType.Removal);
    }

    function _getValidatorIdx(address _addr) private view returns (uint) {
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("no such a validator");
    }


    /********************* old function records *********************/
    // function punish(
    //     uint _cpNumber,
    //     bytes calldata _blockNumber,
    //     bytes calldata _headersProofBytes,
    //     bytes calldata _txIndex,
    //     bytes calldata _receiptsProofBytes
    // )
    //     external
    // {
    //     bytes[Len] memory logs = _merkleProof(_cpNumber, _blockNumber, _headersProofBytes, _txIndex, _receiptsProofBytes);

    //     bytes32 topic = _bytesToBytes32(RLP._decodeString(logs[1]), 0);
    //     require(topic == PunishEventHash, "not Punish event");

    //     bytes memory data = logs[2];

    //     address client = _bytesToAddress(RLP._slice(data, 12, 20), 0);

    //     uint cnt = _bytesToUint(RLP._slice(data, 32, 32));

    //     for (uint i = 0; i < cnt; i++) {
    //         address guardian = _bytesToAddress(RLP._slice(data, (i + 2) * 32 + 12, 32), 0);

    //         uint amount = securityDeposit[guardian];
    //         securityDeposit[guardian] = 0;

    //         celerToken.approve(client, amount);
    //         celerToken.safeTransfer(
    //             client,
    //             amount
    //         );
    //     }
    // }
}
