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
        uint proposedTime;
    }

    struct Delegator {
        uint delegatedStake;
        uint undelegatingStake;
        mapping(uint => WithdrawIntent) withdrawIntents;
        // valid intent range is [intentStartIndex, intentEndIndex)
        uint intentStartIndex;
        uint intentEndIndex;
    }

    struct ValidatorCandidate {
        bool initialized;
        uint minSelfStake;
        bytes sidechainAddr;

        // delegatedStake sum of all delegators to this candidate
        uint stakingPool;
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
    // universal requirement for minimum staking pool of each validator
    uint public minStakeInPool;
    mapping (address => uint) public subscriptionDeposits;
    uint public servicePool;
    mapping (address => uint) public redeemedServiceReward;
    uint public miningPool;
    mapping (address => uint) public redeemedMiningReward;
    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    mapping (uint => bool) public usedPenaltyNonce;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;
    // used in _checkValidatorSigs(). mapping has to be storage type.
    mapping (address => bool) private checkedValidators;
    uint totalValidatorStakingPool;

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
        uint _minStakeInPool,
        uint _sidechainGoLiveTimeout
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        blameTimeout = _blameTimeout;
        minValidatorNum = _minValidatorNum;
        minStakeInPool = _minStakeInPool;
        sidechainGoLiveTime = block.number.add(_sidechainGoLiveTimeout);
    }

    function contributeToMiningPool(uint _amount) public {
        address msgSender = msg.sender;
        miningPool = miningPool.add(_amount);
        celerToken.safeTransferFrom(msgSender, address(this), _amount);

        emit MiningPoolContribution(msgSender, _amount, miningPool);
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

        emit Delegate(msgSender, _candidateAddr, _amount, candidate.stakingPool);
    }

    function updateSidechainAddr(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;
        require(
            candidateProfiles[msgSender].status == CandidateStatus.Unbonded,
            "msg.sender is not unbonded"
        );
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
        require(candidate.stakingPool >= minStakeInPool, "Insufficient staking pool");
        require(
            candidate.delegatorProfiles[msgSender].delegatedStake >= candidate.minSelfStake,
            "Not enough self stake"
        );

        uint minStakingPoolIndex = 0;
        uint minStakingPool = candidateProfiles[validatorSet[0]].stakingPool;
        require(validatorSet[0] != msgSender, "Already in validator set");
        for (uint i = 1; i < VALIDATOR_SET_MAX_SIZE; i++) {
            require(validatorSet[i] != msgSender, "Already in validator set");
            if (candidateProfiles[validatorSet[i]].stakingPool < minStakingPool) {
                minStakingPoolIndex = i;
                minStakingPool = candidateProfiles[validatorSet[i]].stakingPool;
            }
        }
        require(candidate.stakingPool > minStakingPool, "Stake is less than all validators");

        address removedValidator = validatorSet[minStakingPoolIndex];
        if (removedValidator != address(0)) {
            _removeValidator(minStakingPoolIndex);
        }
        _addValidator(msgSender, minStakingPoolIndex);
    }

    function confirmUnbondedCandidate(address _candidateAddr) external {
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        require(candidate.status == CandidateStatus.Unbonding);
        require(block.number >= candidate.unbondTime);

        candidate.status = CandidateStatus.Unbonded;
        delete candidate.unbondTime;
        emit CandidateUnbonded(_candidateAddr);
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
        _updateDelegatedStake(candidate, msgSender, _amount, MathOperation.Sub);
        celerToken.safeTransfer(msgSender, _amount);

        emit WithdrawFromUnbondedCandidate(msgSender, _candidateAddr, _amount);
    }

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
        _validateValidator(_candidateAddr);

        WithdrawIntent storage withdrawIntent = delegator.withdrawIntents[delegator.intentEndIndex];
        withdrawIntent.amount = _amount;
        withdrawIntent.proposedTime = block.number;
        delegator.intentEndIndex++;

        emit IntendWithdraw(
            msgSender,
            _candidateAddr,
            _amount,
            withdrawIntent.proposedTime
        );
    }

    function confirmWithdraw(address _candidateAddr) external onlyNonZeroAddr(_candidateAddr) {
        address msgSender = msg.sender;
        Delegator storage delegator =
            candidateProfiles[_candidateAddr].delegatorProfiles[msgSender];

        uint bn = block.number;
        uint i;
        bool isUnbonded = candidateProfiles[_candidateAddr].status == CandidateStatus.Unbonded;
        // for all undelegated withdraw intents
        for (i = delegator.intentStartIndex; i < delegator.intentEndIndex; i++) {
            WithdrawIntent storage wi = delegator.withdrawIntents[i];
            if (isUnbonded || wi.proposedTime.add(blameTimeout) <= bn) {
                // withdraw intent is undelegated when the validator becomes unbonded or the blameTimeout
                // for the withdraw intent is up.
                delete delegator.withdrawIntents[i];
                continue;
            }
            break;
        }
        delegator.intentStartIndex = i;
        // for all undelegating withdraw intents
        uint undelegatingStakeWithoutSlash = 0;
        for (; i < delegator.intentEndIndex; i++) {
            WithdrawIntent storage wi = delegator.withdrawIntents[i];
            undelegatingStakeWithoutSlash = undelegatingStakeWithoutSlash.add(wi.amount);
        }

        uint withdrawAmt = 0;
        if (delegator.undelegatingStake > undelegatingStakeWithoutSlash) {
            withdrawAmt = delegator.undelegatingStake.sub(undelegatingStakeWithoutSlash);
            delegator.undelegatingStake = undelegatingStakeWithoutSlash;

            celerToken.safeTransfer(msgSender, withdrawAmt);
        }

        emit ConfirmWithdraw(msgSender, _candidateAddr, withdrawAmt);
    }

    function subscribe(uint _amount) external onlyValidSidechain {
        address msgSender = msg.sender;

        servicePool = servicePool.add(_amount);
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
        require(!usedPenaltyNonce[penalty.nonce], "Used penalty nonce");
        require(block.number < penalty.expireTime, "Penalty expired");

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
        }
        _validateValidator(penalty.validatorAddress);

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

    function redeemReward(bytes calldata _rewardRequest) external onlyValidSidechain {
        PbSgn.RewardRequest memory rewardRequest = PbSgn.decRewardRequest(_rewardRequest);
        PbSgn.Reward memory reward = PbSgn.decReward(rewardRequest.reward);

        bytes32 h = keccak256(rewardRequest.reward);
        require(
            _checkValidatorSigs(h, rewardRequest.sigs),
            "Fail to check validator sigs"
        );

        uint newMiningReward =
            reward.cumulativeMiningReward.sub(redeemedMiningReward[reward.receiver]);
        redeemedMiningReward[reward.receiver] = reward.cumulativeMiningReward;
        uint newServiceReward =
            reward.cumulativeServiceReward.sub(redeemedServiceReward[reward.receiver]);
        redeemedServiceReward[reward.receiver] = reward.cumulativeServiceReward;

        miningPool = miningPool.sub(newMiningReward);
        servicePool = servicePool.sub(newServiceReward);

        celerToken.safeTransfer(reward.receiver, newMiningReward.add(newServiceReward));

        emit RedeemReward(reward.receiver, newMiningReward, newServiceReward, miningPool, servicePool);
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

    function getMinStakingPool() public view returns (uint) {
        uint minStakingPool = 0;
        uint i = 0;
        for (; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == address(0)) {
                continue;
            }

            minStakingPool = candidateProfiles[validatorSet[i]].stakingPool;
            break;
        }

        for (i++; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (candidateProfiles[validatorSet[i]].stakingPool < minStakingPool) {
                minStakingPool = candidateProfiles[validatorSet[i]].stakingPool;
            }
        }

        return minStakingPool;
    }

    function getCandidateInfo(address _candidateAddr) public view returns (
        bool initialized,
        uint minSelfStake,
        bytes memory sidechainAddr,
        uint stakingPool,
        uint status,
        uint unbondTime
    )
    {
        ValidatorCandidate storage c = candidateProfiles[_candidateAddr];

        initialized = c.initialized;
        minSelfStake = c.minSelfStake;
        sidechainAddr = c.sidechainAddr;
        stakingPool = c.stakingPool;
        status = uint(c.status);
        unbondTime = c.unbondTime;
    }

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) public view
        returns (
        uint delegatedStake,
        uint undelegatingStake,
        uint[] memory intentAmounts,
        uint[] memory intentProposedTimes
    )
    {
        Delegator storage d = candidateProfiles[_candidateAddr].delegatorProfiles[_delegatorAddr];

        uint len = d.intentEndIndex.sub(d.intentStartIndex);
        intentAmounts = new uint[](len);
        intentProposedTimes = new uint[](len);
        for (uint i = d.intentStartIndex; i < d.intentEndIndex; i++) {
            intentAmounts[i] = d.withdrawIntents[i].amount;
            intentProposedTimes[i] = d.withdrawIntents[i].proposedTime;
        }

        delegatedStake = d.delegatedStake;
        undelegatingStake = d.undelegatingStake;
    }

    function getMinQuorumStakingPool() public view returns(uint) {
        return totalValidatorStakingPool.mul(2).div(3).add(1);
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
            _candidate.stakingPool = _candidate.stakingPool.add(_amount);
            delegator.delegatedStake = delegator.delegatedStake.add(_amount);
        } else if (_op == MathOperation.Sub) {
            _candidate.stakingPool = _candidate.stakingPool.sub(_amount);
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
        totalValidatorStakingPool = totalValidatorStakingPool.add(candidateProfiles[_validatorAddr].stakingPool);
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
        totalValidatorStakingPool = totalValidatorStakingPool.sub(candidateProfiles[removedValidator].stakingPool);
        emit ValidatorChange(removedValidator, ValidatorChangeType.Removal);
    }

    function _validateValidator(address _validatorAddr) private {
        ValidatorCandidate storage v = candidateProfiles[_validatorAddr];
        if (v.status != CandidateStatus.Bonded) {
            // no need to validate the stake of a non-validator
            return;
        }

        bool lowSelfStake = v.delegatorProfiles[_validatorAddr].delegatedStake < v.minSelfStake;
        bool lowStakingPool = v.stakingPool < minStakeInPool;

        if (lowSelfStake || lowStakingPool) {
            _removeValidator(_getValidatorIdx(_validatorAddr));
        }
    }

    // validators with more than 2/3 total validators' staking pool need to sign this hash
    function _checkValidatorSigs(bytes32 _h, bytes[] memory _sigs) private returns(bool) {
        uint minQuorumStakingPool = getMinQuorumStakingPool();

        bytes32 hash = _h.toEthSignedMessageHash();
        address[] memory addrs = new address[](_sigs.length);
        uint quorumStakingPool = 0;
        for (uint i = 0; i < _sigs.length; i++) {
            addrs[i] = hash.recover(_sigs[i]);
            if (checkedValidators[addrs[i]]) {
                return false;
            }
            if (candidateProfiles[addrs[i]].status != CandidateStatus.Bonded) {
                continue;
            }

            quorumStakingPool = quorumStakingPool.add(candidateProfiles[addrs[i]].stakingPool);
            checkedValidators[addrs[i]] = true;
        }

        for (uint i = 0; i < _sigs.length; i++) {
            checkedValidators[addrs[i]] = false;
        }

        return quorumStakingPool >= minQuorumStakingPool;
    }

    function _getValidatorIdx(address _addr) private view returns (uint) {
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("No such a validator");
    }
}
