pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "../lib/interface/IGuard.sol";

contract GuardMock is IGuard {
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

    constructor() public {
        feePerBlock = 10;
        // no withdrawTimeout for mock(test) purpose
        withdrawTimeout = 0;
    }

    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];

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

        emit Delegate(msgSender, _candidate, _amount, candidate.totalLockedStake);
    }

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
            emit ValidatorChange(removedValidator, ValidatorChangeType.Removal);
        }
        emit ValidatorChange(msgSender, ValidatorChangeType.Add);
        validatorSet[minStakeIndex] = msgSender;
    }

    function intendWithdraw(uint _amount, address _candidate) external onlyNonNullAddr(_candidate) {
        address msgSender = msg.sender;

        ValidatorCandidate storage candidate = candidateProfiles[_candidate];

        candidate.totalLockedStake = candidate.totalLockedStake.sub(_amount);
        candidate.delegatorProfiles[msgSender].lockedStake =
            candidate.delegatorProfiles[msgSender].lockedStake.sub(_amount);

        // candidate withdraws its self stake
        if (_candidate == msgSender && isValidator(_candidate)) {
            if (candidate.delegatorProfiles[msgSender].lockedStake < candidate.minSelfStake) {
                validatorSet[_getValidatorIdx(_candidate)] = address(0);
                emit ValidatorChange(_candidate, ValidatorChangeType.Removal);
            }
        }

        WithdrawIntent memory withdrawIntent;
        withdrawIntent.amount = _amount;
        withdrawIntent.unlockTime = block.timestamp.add(withdrawTimeout);
        candidate.delegatorProfiles[msgSender].withdrawIntents.push(withdrawIntent);
        emit IntendWithdraw(
            msgSender,
            _candidate,
            _amount,
            withdrawIntent.unlockTime,
            candidate.totalLockedStake
        );
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

        emit Subscription(msgSender, _amount, subscriptionExpiration[msgSender]);
    }

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

    function getMinStake() public view returns (uint) {
        uint minStake = candidateProfiles[validatorSet[0]].totalLockedStake;

        for (uint i = 1; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (minStake == 0) {
                break;
            }

            if (candidateProfiles[validatorSet[i]].totalLockedStake < minStake) {
                minStake = candidateProfiles[validatorSet[i]].totalLockedStake;
            }
        }

        return minStake;
    }

    function getCandidateInfo(
        address _candidateAddr
    )
        public
        view
        returns (bool, uint, bytes memory, uint, bool)
    {
        ValidatorCandidate storage c = candidateProfiles[_candidateAddr];
        return (
            c.initialized,
            c.minSelfStake,
            c.sidechainAddr,
            c.totalLockedStake,
            isValidator(_candidateAddr)
        );
    }

    function getDelegatorInfo(
        address _candidateAddr,
        address _delegatorAddr
    )
        public
        view
        returns (uint, uint[] memory, uint[] memory, uint)
    {
        Delegator storage d = candidateProfiles[_candidateAddr].delegatorProfiles[_delegatorAddr];

        uint len = d.withdrawIntents.length;
        uint[] memory intentAmounts = new uint[](len);
        uint[] memory intentUnlockTimes = new uint[](len);
        for (uint i = 0; i < d.withdrawIntents.length; i++) {
            intentAmounts[i] = d.withdrawIntents[i].amount;
            intentUnlockTimes[i] = d.withdrawIntents[i].unlockTime;
        }

        return (
            d.lockedStake,
            intentAmounts,
            intentUnlockTimes,
            d.nextWithdrawIntent
        );
    }

    function _getValidatorIdx(address _addr) private view returns (uint) {
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("no such a validator");
    }
}
