pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./lib/interface/IGuard.sol";
import "./lib/data/PbSgn.sol";

contract Guard is IGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

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
        uint undelegateTime;
        bool withdrawed;
    }

    struct Delegator {
        uint delegatedStake;
        uint undelegatingStake;
        WithdrawIntent[] withdrawIntents;
    }

    struct ValidatorCandidate {
        bool initialized;
        uint minSelfStake;
        bytes sidechainAddr;

        // total sum of delegatedStake of each delegator
        uint totalStake;
        mapping (address => Delegator) delegatorProfiles;
        CandidateStatus status;
        uint unbondTime;
    }

    uint public constant VALIDATOR_SET_MAX_SIZE = 11;

    IERC20 public celerToken;
    // timeout to blame (claim responsibility of) undelegating delegators or unbonding validators
    uint public blameTimeout;
    uint public minValidatorNum;
    // used for bootstrap: there should be enough time for delegating and
    // claim the initial validators
    uint public sidechainGoLiveTime;
    // universal requirement for minimum total stake of each validator
    uint public minTotalStake;
    uint public subscriptionPool;
    mapping (address => uint) public subscriptionDeposits;
    uint public miningPool;
    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    mapping (uint => bool) public usedPenaltyNonce;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;

    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    // check this before sidechain's operation
    modifier onlyValidSidechain() {
        require(block.number >= sidechainGoLiveTime, "Sidechain is not live");
        require(getValidatorNum() >= minValidatorNum, "Too few validators");
        _;
    }

    constructor(
        address _celerTokenAddress,
        uint _blameTimeout,
        uint _minValidatorNum,
        uint _minTotalStake,
        uint _sidechainGoLiveTimeout
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        blameTimeout = _blameTimeout;
        minValidatorNum = _minValidatorNum;
        minTotalStake = _minTotalStake;
        sidechainGoLiveTime = block.number.add(_sidechainGoLiveTimeout);
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
        _updateDelegatedStake(candidate, msgSender, _amount, MathOperation.Add);

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

    function claimValidator() external {
        address msgSender = msg.sender;
        ValidatorCandidate storage candidate = candidateProfiles[msgSender];
        require(candidate.initialized, "Candidate is not initialized");
        // TODO: decide whether Unbonding status is valid to claimValidator or not
        require(candidate.status == CandidateStatus.Unbonded);
        require(candidate.totalStake >= minTotalStake, "Not enough total stake");
        require(
            candidate.delegatorProfiles[msgSender].delegatedStake >= candidate.minSelfStake,
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
        // TODO: what if there is an withdraw intent exist?
        // next time I can withdraw immediately?
        _updateDelegatedStake(candidate, msgSender, _amount, MathOperation.Sub);

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

        _updateDelegatedStake(candidate, msgSender, _amount, MathOperation.Sub);
        delegator.undelegatingStake = delegator.undelegatingStake.add(_amount);
        
        WithdrawIntent memory withdrawIntent;
        withdrawIntent.amount = _amount;
        if (candidate.status == CandidateStatus.Bonded) {
            bool lowSelfStake = _candidateAddr == msgSender && delegator.delegatedStake < candidate.minSelfStake;
            bool lowTotalStake = candidate.totalStake < minTotalStake;
            
            if (lowSelfStake || lowTotalStake) {
                _removeValidator(_getValidatorIdx(_candidateAddr));
            }

            withdrawIntent.undelegateTime = block.number.add(blameTimeout);
        } else if (candidate.status == CandidateStatus.Unbonding) {
            // no need to wait another blameTimeout
            withdrawIntent.undelegateTime = candidate.unbondTime;
        } else {
            revert("Candidate status is not Bonded or Unbonding");
        }

        delegator.withdrawIntents.push(withdrawIntent);
        emit IntendWithdraw(
            msgSender,
            _candidateAddr,
            delegator.withdrawIntents.length - 1,
            _amount,
            withdrawIntent.undelegateTime
        );
    }

    function confirmWithdraw(
        address _candidateAddr,
        uint[] calldata _intentIndexes
    )
        external
        onlyNonZeroAddr(_candidateAddr)
    {
        address msgSender = msg.sender;
        Delegator storage delegator =
            candidateProfiles[_candidateAddr].delegatorProfiles[msgSender];

        // uint intentLen = delegator.withdrawIntents.length;
        uint bn = block.number;
        uint withdrawAmount = 0;
        for (uint i = 0; i < _intentIndexes.length; i++) {
            WithdrawIntent storage wi = delegator.withdrawIntents[_intentIndexes[i]];
            // Not needed for a dynamic array
            // require(wi.undelegateTime > 0, "Null intent");
            require(bn >= wi.undelegateTime, "Not undelegated");
            require(!wi.withdrawed, "Withdrawed intent");

            withdrawAmount = withdrawAmount.add(wi.amount);
            wi.withdrawed = true;
            delegator.undelegatingStake = delegator.undelegatingStake.sub(wi.amount);
            
            emit ConfirmWithdraw(msgSender, _candidateAddr, _intentIndexes[i], wi.amount);
        }
        celerToken.safeTransfer(msgSender, withdrawAmount);
    }

    function subscribe(uint _amount) external onlyValidSidechain {
        address msgSender = msg.sender;

        subscriptionPool = subscriptionPool.add(_amount);
        subscriptionDeposits[msgSender] = subscriptionDeposits[msgSender].add(_amount);

        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit AddSubscriptionBalance(msgSender, _amount);
    }

    function punish(bytes calldata _penaltyRequest) external onlyValidSidechain {
        PbSgn.PenaltyRequest memory penaltyRequest = PbSgn.decPenaltyRequest(_penaltyRequest);
        PbSgn.Penalty memory penalty = PbSgn.decPenalty(penaltyRequest.penalty);
        
        bytes32 h = keccak256(penaltyRequest.penalty);
        require(
            _checkValidatorSigs(h, penaltyRequest.sigs),
            "Fail to check validator sigs"
        );
        require(!usedPenaltyNonce[penalty.nonce]);
        require(block.number < penalty.expireTime);

        usedPenaltyNonce[penalty.nonce] = true;

        ValidatorCandidate storage validator = candidateProfiles[penalty.validatorAddress];
        uint totalSubAmt = 0;
        for (uint i = 0; i < penalty.penalizedDelegators.length; i++) {
            PbSgn.AccountAmtPair memory penalizedDelegator = penalty.penalizedDelegators[i];
            totalSubAmt = totalSubAmt.add(penalizedDelegator.amt);
            emit Punish(penalty.validatorAddress, penalizedDelegator.account, penalizedDelegator.amt);

            Delegator storage delegator = validator.delegatorProfiles[penalizedDelegator.account];
            if (delegator.delegatedStake >= penalizedDelegator.amt) {
                _updateDelegatedStake(validator, penalizedDelegator.account, penalizedDelegator.amt, MathOperation.Sub);
            } else {
                uint remainingAmt = penalizedDelegator.amt.sub(delegator.delegatedStake);
                delegator.undelegatingStake = delegator.undelegatingStake.sub(remainingAmt);
                _updateDelegatedStake(validator, penalizedDelegator.account, delegator.delegatedStake, MathOperation.Sub);
            }

            // TODO: if the remaining stake is lower than the required amount, remove it from validator set
        }

        uint totalAddAmt = 0;
        for (uint i = 0; i < penalty.beneficiaries.length; i++) {
            PbSgn.AccountAmtPair memory beneficiary = penalty.beneficiaries[i];
            totalAddAmt = totalAddAmt.add(beneficiary.amt);
            emit Indemnify(beneficiary.account, beneficiary.amt);

            if (beneficiary.account == address(0)) {
                // address(0) stands for miningPool
                miningPool = miningPool.add(beneficiary.amt);
            } else {
                celerToken.safeTransfer(beneficiary.account, beneficiary.amt);
            }
        }

        require(totalSubAmt == totalAddAmt, "Amount doesn't match");
    }

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
        uint delegatedStake,
        uint undelegatingStake,
        uint[] memory intentAmounts,
        uint[] memory intentUndelegateTimes,
        bool[] memory intentWithdrawed
    )
    {
        Delegator storage d = candidateProfiles[_candidateAddr].delegatorProfiles[_delegatorAddr];

        uint len = d.withdrawIntents.length;
        intentAmounts = new uint[](len);
        intentUndelegateTimes = new uint[](len);
        intentWithdrawed = new bool[](len);
        for (uint i = 0; i < d.withdrawIntents.length; i++) {
            intentAmounts[i] = d.withdrawIntents[i].amount;
            intentUndelegateTimes[i] = d.withdrawIntents[i].undelegateTime;
            intentWithdrawed[i] = d.withdrawIntents[i].withdrawed;
        }

        delegatedStake = d.delegatedStake;
        undelegatingStake = d.undelegatingStake;
    }

    function _updateDelegatedStake(
        ValidatorCandidate storage _candidate,
        address _delegatorAddr,
        uint _amount,
        MathOperation _op
    )
        private
    {
        Delegator storage delegator = _candidate.delegatorProfiles[_delegatorAddr];

        if (_op == MathOperation.Add) {
            _candidate.totalStake = _candidate.totalStake.add(_amount);
            delegator.delegatedStake = delegator.delegatedStake.add(_amount);
        } else if (_op == MathOperation.Sub) {
            _candidate.totalStake = _candidate.totalStake.sub(_amount);
            delegator.delegatedStake = delegator.delegatedStake.sub(_amount);
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
        candidateProfiles[removedValidator].unbondTime = block.number.add(blameTimeout);
        emit ValidatorChange(removedValidator, ValidatorChangeType.Removal);
    }

    function _getValidatorIdx(address _addr) private view returns (uint) {
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("No such a validator");
    }

    // more than 2/3 validators sign this hash
    function _checkValidatorSigs(bytes32 _h, bytes[] memory _sigs) private view returns(bool) {
        // TODO: need to compute dynamically because there might be less validators
        uint minQuorumSize = 8;

        if (minQuorumSize > _sigs.length) {
            return false;
        }

        bytes32 hash = _h.toEthSignedMessageHash();
        address addr;
        uint quorumSize = 0;
        for (uint i = 0; i < _sigs.length; i++) {
            addr = hash.recover(_sigs[i]);
            if (candidateProfiles[addr].status == CandidateStatus.Bonded) {
                quorumSize++;
            }
        }

        return quorumSize >= minQuorumSize;
    }
}
