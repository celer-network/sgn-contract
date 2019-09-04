pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "./lib/interface/IGuard.sol";

contract Guard is IGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct WithdrawIntent {
        uint amount;
        uint unlockTime;
    }

    struct Delegator {
        uint lockedStake;
        WithdrawIntent[] withdrawIntents;
        uint nextWithdrawIntent;
    }

    struct ValidatorCandidate {
        bool initialized;
        uint minSelfStake;
        bytes sidechainAddr;

        uint totalLockedStake;
        // TODO: do we need address[] delegators?
        mapping (address => Delegator) delegatorProfiles;
    }

    uint public constant VALIDATOR_SET_MAX_SIZE = 11;

    IERC20 public celerToken;
    // subscription fee per block
    uint public feePerBlock;
    uint public withdrawTimeout;
    uint public minValidatorNum;
    // used for bootstrap: there should be enough time for delegating and
    // claim the initial validators
    uint public sidechainGoLive;

    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;
    // consumer subscription
    mapping (address => uint) public subscriptionExpiration;

    modifier onlyNonNullAddr(address _addr) {
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
        uint _withdrawTimeout,
        uint _minValidatorNum
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        feePerBlock = _feePerBlock;
        withdrawTimeout = _withdrawTimeout;
        minValidatorNum = _minValidatorNum;
    }

    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(!candidate.initialized, "Candidate is initialized");

        candidate.initialized = true;
        candidate.minSelfStake = _minSelfStake;
        candidate.sidechainAddr = _sidechainAddr;

        emit InitializeCandidate(msg.sender, _minSelfStake, _sidechainAddr);
    }

    function delegate(uint _amount, address _candidate) external onlyNonNullAddr(_candidate) {
        ValidatorCandidate storage candidate = candidateProfiles[_candidate];
        require(candidate.initialized, "Candidate is not initialized");

        address msgSender = msg.sender;
        candidate.delegatorProfiles[msgSender].lockedStake =
            candidate.delegatorProfiles[msgSender].lockedStake.add(_amount);
        candidate.totalLockedStake =
            candidate.totalLockedStake.add(_amount);

        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit Delegate(msgSender, _candidate, _amount, candidate.totalLockedStake);
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

        uint minStakeIndex = 0;
        uint minStake = candidateProfiles[validatorSet[0]].totalLockedStake;
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            require(validatorSet[i] != msgSender, "Already in validator set");
            if (candidateProfiles[validatorSet[i]].totalLockedStake < minStake) {
                minStakeIndex = i;
                minStake = candidateProfiles[validatorSet[i]].totalLockedStake;
            }
        }

        require(candidate.totalLockedStake > minStake, "Not enough stake");
        address removedValidator = validatorSet[minStakeIndex];
        if (removedValidator != address(0)) {
            emit ValidatorChange(
                removedValidator,
                candidateProfiles[removedValidator].sidechainAddr,
                ValidatorChangeType.Removal
            );
        }
        emit ValidatorChange(msgSender, candidate.sidechainAddr, ValidatorChangeType.Add);
        validatorSet[minStakeIndex] = msgSender;
    }

    function intendWithdraw(uint _amount, address _candidate) external onlyNonNullAddr(_candidate) {
        address msgSender = msg.sender;

        ValidatorCandidate storage candidate = candidateProfiles[_candidate];

        candidate.totalLockedStake = candidate.totalLockedStake.sub(_amount);
        candidate.delegatorProfiles[msgSender].lockedStake =
            candidate.delegatorProfiles[msgSender].lockedStake.sub(_amount);
        emit LockedStakeUpdate(_candidate, candidate.sidechainAddr, candidate.totalLockedStake);

        // candidate withdraws its self stake
        if (_candidate == msgSender && isValidator(_candidate)) {
            if (candidate.delegatorProfiles[msgSender].lockedStake < minSelfStake) {
                validatorSet[_getValidatorIdx(_candidate)] = address(0);
                emit ValidatorChange(_candidate, candidate.sidechainAddr, ValidatorChangeType.Removal);
            }
        }

        WithdrawIntent memory withdrawIntent;
        withdrawIntent.amount = _amount;
        withdrawIntent.unlockTime = block.timestamp.add(withdrawTimeout);
        candidate.delegatorProfiles[msgSender].withdrawIntents.push(withdrawIntent);
        emit IntendWithdraw(msgSender, _candidate, _amount, withdrawIntent.unlockTime);
    }

    function confirmWithdraw(address _candidate) external onlyNonNullAddr(_candidate) {
        address msgSender = msg.sender;

        Delegator storage delegator = candidateProfiles[_candidate].delegatorProfiles[msgSender];

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

        emit ConfirmWithdraw(msgSender, _candidate, withdrawAmount);
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
        if (_addr == address(0)) {
            return false;
        }

        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return true;
            }
        }

        return false;
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

    function _getValidatorIdx(address _addr) private view returns (uint) {
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("no such a validator");
    }



    /******************** old function records ********************/
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
