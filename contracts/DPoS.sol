pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./lib/interface/IDPoS.sol";
import "./lib/data/PbSgn.sol";
import "./lib/DPoSCommon.sol";
import "./lib/Govern.sol";

/**
 * @title A DPoS contract shared by every sidechain
 * @notice This contract holds the basic logic of DPoS in Celer's coherent sidechain system
 */
contract DPoS is IDPoS, Govern {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum MathOperation { Add, Sub }

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

        // stakingPool sum of all delegations to this candidate
        uint stakingPool;
        mapping (address => Delegator) delegatorProfiles;
        DPoSCommon.CandidateStatus status;
        uint unbondTime;

        uint commissionRate;  // equal to real commission rate * COMMISSION_RATE_BASE
        uint rateLockEndTime;  // must be monotonic increasing. Use block number
        // for the announcement of increasing commission rate
        uint announcedRate;
        uint announcedLockEndTime;
        uint announcementTime;
    }

    mapping (uint => address) public validatorSet;
    mapping (uint => bool) public usedPenaltyNonce;
    // used in checkValidatorSigs(). mapping has to be storage type.
    mapping (address => bool) public checkedValidators;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;
    mapping (address => uint) public redeemedMiningReward;

    /********** Constants **********/
    uint constant public COMMISSION_RATE_BASE = 10000;  // 1 commissionRate means 0.01%

    /********** TODO: use Immutable after migrating to Solidity v0.6.5 or higher **********/
    IERC20 public celerToken;
    // used for bootstrap: there should be enough time for delegating and claim the initial validators
    uint public dposGoLiveTime;
    uint public miningPool;

    /**
     * @notice Throws if given address is zero address
     * @param _addr address to be checked
     */
    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    /**
     * @notice Throws if DPoS is not valid
     * @dev Need to be checked before DPoS's operations
     */
    modifier onlyValidDPoS() {
        require(isValidDPoS(), "DPoS is not valid");
        _;
    }

    /**
     * @notice Throws if msg.sender is not a registered sidechain
     */
    modifier onlyRegisteredSidechains() {
        require(isSidechainRegistered(msg.sender));
        _;
    }

    /**
     * @notice DPoS constructor
     * @dev will initialize parent contract Govern first
     * @param _celerTokenAddress address of Celer Token Contract
     * @param _governProposalDeposit required deposit amount for a governance proposal
     * @param _governVoteTimeout voting timeout for a governance proposal
     * @param _blameTimeout the locking timeout of funds for blaming malicious behaviors
     * @param _minValidatorNum the minimum number of validators
     * @param _maxValidatorNum the maximum number of validators
     * @param _minStakeInPool the global minimum requirement of staking pool for each validator
     * @param _increaseRateWaitTime the wait time for increasing commission rate after an announcement
     * @param _dposGoLiveTimeout the timeout for DPoS to go live after contract creatation
     */
    constructor(
        address _celerTokenAddress,
        uint _governProposalDeposit,
        uint _governVoteTimeout,
        uint _blameTimeout,
        uint _minValidatorNum,
        uint _maxValidatorNum,
        uint _minStakeInPool,
        uint _increaseRateWaitTime,
        uint _dposGoLiveTimeout
    )
        Govern(
            _celerTokenAddress,
            _governProposalDeposit,
            _governVoteTimeout,
            _blameTimeout,
            _minValidatorNum,
            _maxValidatorNum,
            _minStakeInPool,
            _increaseRateWaitTime
        )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        dposGoLiveTime = block.number.add(_dposGoLiveTimeout);
    }

    /**
     * @notice Vote for a parameter proposal with a specific type of vote
     * @param _proposalId the id of the parameter proposal
     * @param _vote the type of vote
     */
    function voteParam(uint _proposalId, VoteType _vote) public {
        address msgSender = msg.sender;
        require(isValidator(msgSender), "msg sender is not a validator");

        internalVoteParam(_proposalId, msgSender, _vote);
    }

    /**
     * @notice Confirm a parameter proposal
     * @param _proposalId the id of the parameter proposal
     */
    function confirmParamProposal(uint _proposalId) public {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        // check Yes votes only now
        uint yesVotes = 0;
        for (uint i = 0; i < maxValidatorNum; i++) {
            if (getParamProposalVote(_proposalId, validatorSet[i]) == VoteType.Yes) {
                yesVotes = yesVotes.add(candidateProfiles[validatorSet[i]].stakingPool);
            }
        }

        bool passed = yesVotes >= getMinQuorumStakingPool();
        internalConfirmParamProposal(_proposalId, passed);
    }

    /**
     * @notice Vote for a sidechain proposal with a specific type of vote
     * @param _proposalId the id of the sidechain proposal
     * @param _vote the type of vote
     */
    function voteSidechain(uint _proposalId, VoteType _vote) public {
        address msgSender = msg.sender;
        require(isValidator(msgSender), "msg sender is not a validator");

        internalVoteSidechain(_proposalId, msgSender, _vote);
    }

    /**
     * @notice Confirm a sidechain proposal
     * @param _proposalId the id of the sidechain proposal
     */
    function confirmSidechainProposal(uint _proposalId) public {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        // check Yes votes only now
        uint yesVotes = 0;
        for (uint i = 0; i < maxValidatorNum; i++) {
            if (getSidechainProposalVote(_proposalId, validatorSet[i]) == VoteType.Yes) {
                yesVotes = yesVotes.add(candidateProfiles[validatorSet[i]].stakingPool);
            }
        }

        bool passed = yesVotes >= getMinQuorumStakingPool();
        internalConfirmSidechainProposal(_proposalId, passed);
    }

    /**
     * @notice Contribute CELR tokens to the mining pool
     * @param _amount the amount of CELR tokens to contribute
     */
    function contributeToMiningPool(uint _amount) public {
        address msgSender = msg.sender;
        miningPool = miningPool.add(_amount);
        celerToken.safeTransferFrom(msgSender, address(this), _amount);

        emit MiningPoolContribution(msgSender, _amount, miningPool);
    }

    /**
     * @notice Redeem mining reward
     * @dev The validation of this redeeming operation should be done by the caller, a registered sidechain contract
     * @dev Here we use cumulative mining reward to simplify the logic in sidechain code
     * @param _receiver the receiver of the redeemed mining reward
     * @param _cumulativeReward the latest cumulative mining reward
     */
    function redeemMiningReward(address _receiver, uint _cumulativeReward) public onlyRegisteredSidechains {
        uint newReward = _cumulativeReward.sub(redeemedMiningReward[_receiver]);
        redeemedMiningReward[_receiver] = _cumulativeReward;

        miningPool = miningPool.sub(newReward);
        celerToken.safeTransfer(_receiver, newReward);

        emit RedeemMiningReward(_receiver, newReward, miningPool);
    }

    /**
     * @notice Initialize a candidate profile for validator
     * @dev every validator must become a candidate first
     * @param _minSelfStake the self-declaimed minimum amount of self stake
     * @param _commissionRate the self-declaimed commission rate
     * @param _rateLockEndTime the lock end time of initial commission rate
     */
    function initializeCandidate(uint _minSelfStake, uint _commissionRate, uint _rateLockEndTime) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(!candidate.initialized, "Candidate is initialized");
        require(_commissionRate <= COMMISSION_RATE_BASE);

        candidate.initialized = true;
        candidate.minSelfStake = _minSelfStake;
        candidate.commissionRate = _commissionRate;
        candidate.rateLockEndTime = _rateLockEndTime;

        emit InitializeCandidate(msg.sender, _minSelfStake, _commissionRate, _rateLockEndTime);
    }

    /**
     * @notice Apply non-increase-commission-rate changes to commission rate or lock end time,
     *   including decreasing commission rate and/or changing lock end time
     * @dev It can increase lock end time immediately without waiting
     * @dev It must wait until the previous lock end time to decrease the commission rate
     * @param _newRate new commission rate
     * @param _newLockEndTime new lock end time
     */
    function nonIncreaseCommissionRate(uint _newRate, uint _newLockEndTime) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(candidate.initialized, "Candidate is not initialized");
        require(_newRate <= candidate.commissionRate, "Invalid new rate");

        _updateCommissionRate(candidate, _newRate, _newLockEndTime);
    }

    /**
     * @notice Announce the intent of increasing the commission rate
     * @param _newRate new commission rate
     * @param _newLockEndTime new lock end time
     */
    function announceIncreaseCommissionRate(uint _newRate, uint _newLockEndTime) external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(candidate.initialized, "Candidate is not initialized");
        require(candidate.commissionRate < _newRate, "Invalid new rate");

        candidate.announcedRate = _newRate;
        candidate.announcedLockEndTime = _newLockEndTime;
        candidate.announcementTime = block.number;

        emit CommissionRateAnnouncement(msg.sender, _newRate, _newLockEndTime);
    }

    /**
     * @notice Confirm the intent of increasing the commission rate
     */
    function confirmIncreaseCommissionRate() external {
        ValidatorCandidate storage candidate = candidateProfiles[msg.sender];
        require(candidate.initialized, "Candidate is not initialized");
        uint increaseRateWaitTime = getUIntValue(uint(ParamNames.IncreaseRateWaitTime));
        require(block.number > candidate.announcementTime + increaseRateWaitTime, "new rate hasn't taken effect");

        _updateCommissionRate(candidate, candidate.announcedRate, candidate.announcedLockEndTime);
    }

    /**
     * @notice Delegate CELR tokens to a candidate
     * @param _candidateAddr candidate to delegate
     * @param _amount the amount of delegated CELR tokens
     */
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

    /**
     * @notice Candidate claims to become a validator
     */
    function claimValidator() external {
        address msgSender = msg.sender;
        ValidatorCandidate storage candidate = candidateProfiles[msgSender];
        require(candidate.initialized, "Candidate is not initialized");
        // TODO: decide whether Unbonding status is valid to claimValidator or not
        require(candidate.status == DPoSCommon.CandidateStatus.Unbonded || candidate.status == DPoSCommon.CandidateStatus.Unbonding);
        uint minStakeInPool = getUIntValue(uint(ParamNames.MinStakeInPool));
        require(candidate.stakingPool >= minStakeInPool, "Insufficient staking pool");
        require(
            candidate.delegatorProfiles[msgSender].delegatedStake >= candidate.minSelfStake,
            "Not enough self stake"
        );

        uint minStakingPoolIndex = 0;
        uint minStakingPool = candidateProfiles[validatorSet[0]].stakingPool;
        require(validatorSet[0] != msgSender, "Already in validator set");
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));
        for (uint i = 1; i < maxValidatorNum; i++) {
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

    /**
     * @notice Confirm candidate status from Unbonding to Unbonded
     * @param _candidateAddr the address of the candidate
     */
    function confirmUnbondedCandidate(address _candidateAddr) external {
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        require(candidate.status == DPoSCommon.CandidateStatus.Unbonding);
        require(block.number >= candidate.unbondTime);

        candidate.status = DPoSCommon.CandidateStatus.Unbonded;
        delete candidate.unbondTime;
        emit CandidateUnbonded(_candidateAddr);
    }

    /**
     * @notice Withdraw delegated stakes from an unbonded candidate
     * @dev note that the stakes are delegated by the msgSender to the candidate
     * @param _candidateAddr the address of the candidate
     * @param _amount withdrawn amount
     */
    function withdrawFromUnbondedCandidate(
        address _candidateAddr,
        uint _amount
    )
        external
        onlyNonZeroAddr(_candidateAddr)
    {
        ValidatorCandidate storage candidate = candidateProfiles[_candidateAddr];
        require(candidate.status == DPoSCommon.CandidateStatus.Unbonded);

        address msgSender = msg.sender;
        _updateDelegatedStake(candidate, msgSender, _amount, MathOperation.Sub);
        celerToken.safeTransfer(msgSender, _amount);

        emit WithdrawFromUnbondedCandidate(msgSender, _candidateAddr, _amount);
    }

    /**
     * @notice Intend to withdraw delegated stakes from a candidate
     * @dev note that the stakes are delegated by the msgSender to the candidate
     * @param _candidateAddr the address of the candidate
     * @param _amount withdrawn amount
     */
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

    /**
     * @notice Confirm an intent of withdrawing delegated stakes from a candidate
     * @dev note that the stakes are delegated by the msgSender to the candidate
     * @param _candidateAddr the address of the candidate
     */
    function confirmWithdraw(address _candidateAddr) external onlyNonZeroAddr(_candidateAddr) {
        address msgSender = msg.sender;
        Delegator storage delegator =
            candidateProfiles[_candidateAddr].delegatorProfiles[msgSender];

        uint bn = block.number;
        uint i;
        bool isUnbonded = candidateProfiles[_candidateAddr].status == DPoSCommon.CandidateStatus.Unbonded;
        // for all undelegated withdraw intents
        for (i = delegator.intentStartIndex; i < delegator.intentEndIndex; i++) {
            WithdrawIntent storage wi = delegator.withdrawIntents[i];
            uint blameTimeout = getUIntValue(uint(ParamNames.BlameTimeout));
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

    /**
     * @notice Punish malicious validators
     * @param _penaltyRequest penalty request bytes coded in protobuf
     */
    function punish(bytes calldata _penaltyRequest) external onlyValidDPoS {
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

    /**
     * @notice Validate multi-signed message
     * @dev Can't use view here because _checkValidatorSigs is not a view function
     * @param _request a multi-signed message bytes coded in protobuf
     * @return passed the validation or not
     */
    function validateMultiSigMessage(bytes calldata _request) external onlyRegisteredSidechains returns(bool) {
        PbSgn.MultiSigMessage memory request = PbSgn.decMultiSigMessage(_request);
        bytes32 h = keccak256(request.msg);

        return _checkValidatorSigs(h, request.sigs);
    }

    /**
     * @notice Check this DPoS contract is valid or not now
     * @return DPoS is valid or not
     */
    function isValidDPoS() public view returns (bool) {
        uint minValidatorNum = getUIntValue(uint(ParamNames.MinValidatorNum));
        return block.number >= dposGoLiveTime && getValidatorNum() >= minValidatorNum;
    }

    /**
     * @notice Check the given address is a validator or not
     * @param _addr the address to check
     * @return the given address is a validator or not
     */
    function isValidator(address _addr) public view returns (bool) {
        return candidateProfiles[_addr].status == DPoSCommon.CandidateStatus.Bonded;
    }

    /**
     * @notice Get the number of validators
     * @return the number of validators
     */
    function getValidatorNum() public view returns (uint) {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        uint num = 0;
        for (uint i = 0; i < maxValidatorNum; i++) {
            if (validatorSet[i] != address(0)) {
                num++;
            }
        }
        return num;
    }

    /**
     * @notice Get the minimum staking pool of all validators
     * @return the minimum staking pool of all validators
     */
    function getMinStakingPool() public view returns (uint) {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        uint minStakingPool = 0;
        uint i = 0;
        for (; i < maxValidatorNum; i++) {
            if (validatorSet[i] == address(0)) {
                continue;
            }

            minStakingPool = candidateProfiles[validatorSet[i]].stakingPool;
            break;
        }

        for (i++; i < maxValidatorNum; i++) {
            if (candidateProfiles[validatorSet[i]].stakingPool < minStakingPool) {
                minStakingPool = candidateProfiles[validatorSet[i]].stakingPool;
            }
        }

        return minStakingPool;
    }

    /**
     * @notice Get candidate info
     * @param _candidateAddr the address of the candidate
     * @return initialized whether initialized or not
     * @return minSelfStake minimum self stakes
     * @return stakingPool staking pool
     * @return status candidate status
     * @return unbondTime unbond time
     * @return commissionRate commission rate
     * @return rateLockEndTime commission rate lock end time
     */
    function getCandidateInfo(address _candidateAddr) public view returns (
        bool initialized,
        uint minSelfStake,
        uint stakingPool,
        uint status,
        uint unbondTime,
        uint commissionRate,
        uint rateLockEndTime
    )
    {
        ValidatorCandidate storage c = candidateProfiles[_candidateAddr];

        initialized = c.initialized;
        minSelfStake = c.minSelfStake;
        stakingPool = c.stakingPool;
        status = uint(c.status);
        unbondTime = c.unbondTime;
        commissionRate = c.commissionRate;
        rateLockEndTime = c.rateLockEndTime;
    }

    /**
     * @notice Get the delegator info of a specific candidate
     * @param _candidateAddr the address of the candidate
     * @param _delegatorAddr the address of the delegator
     * @return delegatedStake delegated stake to this candidate
     * @return undelegatingStake undelegating stakes
     * @return intentAmounts the amounts of withdraw intents
     * @return intentProposedTimes the proposed times of withdraw intents
     */
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

    /**
     * @notice Get minimum amount of stakes for a quorum
     * @return the minimum amount
     */
    function getMinQuorumStakingPool() public view returns(uint) {
        return getTotalValidatorStakingPool().mul(2).div(3).add(1);
    }

    /**
     * @notice Get the total amount of stakes in validators' staking pools
     * @return the total amount
     */
    function getTotalValidatorStakingPool() public view returns(uint) {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        uint totalValidatorStakingPool = 0;
        for (uint i = 0; i < maxValidatorNum; i++) {
            totalValidatorStakingPool = totalValidatorStakingPool.add(candidateProfiles[validatorSet[i]].stakingPool);
        }

        return totalValidatorStakingPool;
    }

    /**
     * @notice Update the commission rate of a candidate
     * @param _candidate the candidate to update
     * @param _newRate new commission rate
     * @param _newLockEndTime new lock end time
     */
    function _updateCommissionRate(ValidatorCandidate storage _candidate, uint _newRate, uint _newLockEndTime) private {
        require(_newRate <= COMMISSION_RATE_BASE, "Invalid new rate");
        require(_newLockEndTime > block.number, "Outdated new lock end time");

        if (_newRate == _candidate.commissionRate) {
            require(_newLockEndTime > _candidate.rateLockEndTime, "New lock end time is not increasing");
        } else {
            require(block.number > _candidate.rateLockEndTime, "Commission rate is locked");
        }

        _candidate.commissionRate = _newRate;
        _candidate.rateLockEndTime = _newLockEndTime;

        delete _candidate.announcedRate;
        delete _candidate.announcedLockEndTime;
        delete _candidate.announcementTime;

        emit UpdateCommissionRate(msg.sender, _newRate, _newLockEndTime);
    }

    /**
     * @notice Update the delegated stake of a delegator to an candidate
     * @param _candidate the candidate
     * @param _delegatorAddr the delegator address
     * @param _amount update amount
     * @param _op update operation
     */
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

    /**
     * @notice Add a validator
     * @param _validatorAddr the address of the validator
     * @param _setIndex the index to put the validator
     */
    function _addValidator(address _validatorAddr, uint _setIndex) private {
        require(validatorSet[_setIndex] == address(0));

        validatorSet[_setIndex] = _validatorAddr;
        candidateProfiles[_validatorAddr].status = DPoSCommon.CandidateStatus.Bonded;
        delete candidateProfiles[_validatorAddr].unbondTime;
        emit ValidatorChange(_validatorAddr, ValidatorChangeType.Add);
    }

    /**
     * @notice Remove a validator
     * @param _setIndex the index of the validator to be removed
     */
    function _removeValidator(uint _setIndex) private {
        address removedValidator = validatorSet[_setIndex];
        if (removedValidator == address(0)) {
            return;
        }

        delete validatorSet[_setIndex];
        candidateProfiles[removedValidator].status = DPoSCommon.CandidateStatus.Unbonding;
        uint blameTimeout = getUIntValue(uint(ParamNames.BlameTimeout));
        candidateProfiles[removedValidator].unbondTime = block.number.add(blameTimeout);
        emit ValidatorChange(removedValidator, ValidatorChangeType.Removal);
    }

    /**
     * @notice Validate a validator status after stakes change
     * @dev remove this validator if it doesn't meet the requirement of being a validator
     * @param _validatorAddr the validator address
     */
    function _validateValidator(address _validatorAddr) private {
        ValidatorCandidate storage v = candidateProfiles[_validatorAddr];
        if (v.status != DPoSCommon.CandidateStatus.Bonded) {
            // no need to validate the stake of a non-validator
            return;
        }

        bool lowSelfStake = v.delegatorProfiles[_validatorAddr].delegatedStake < v.minSelfStake;
        uint minStakeInPool = getUIntValue(uint(ParamNames.MinStakeInPool));
        bool lowStakingPool = v.stakingPool < minStakeInPool;

        if (lowSelfStake || lowStakingPool) {
            _removeValidator(_getValidatorIdx(_validatorAddr));
        }
    }

    /**
     * @notice Check whether validators with more than 2/3 total stakes have signed this hash
     * @param _h signed hash
     * @param _sigs signatures
     * @return whether the signatures are valid or not
     */
    function _checkValidatorSigs(bytes32 _h, bytes[] memory _sigs) private returns(bool) {
        uint minQuorumStakingPool = getMinQuorumStakingPool();

        bytes32 hash = _h.toEthSignedMessageHash();
        address[] memory addrs = new address[](_sigs.length);
        uint quorumStakingPool = 0;
        bool hasDuplicatedSig = false;
        for (uint i = 0; i < _sigs.length; i++) {
            addrs[i] = hash.recover(_sigs[i]);
            if (checkedValidators[addrs[i]]) {
                hasDuplicatedSig = true;
                break;
            }
            if (candidateProfiles[addrs[i]].status != DPoSCommon.CandidateStatus.Bonded) {
                continue;
            }

            quorumStakingPool = quorumStakingPool.add(candidateProfiles[addrs[i]].stakingPool);
            checkedValidators[addrs[i]] = true;
        }

        for (uint i = 0; i < _sigs.length; i++) {
            checkedValidators[addrs[i]] = false;
        }

        return !hasDuplicatedSig && quorumStakingPool >= minQuorumStakingPool;
    }

    /**
     * @notice Get validator index
     * @param _addr the validator address
     * @return the index of the validator
     */
    function _getValidatorIdx(address _addr) private view returns (uint) {
        uint maxValidatorNum = getUIntValue(uint(ParamNames.MaxValidatorNum));

        for (uint i = 0; i < maxValidatorNum; i++) {
            if (validatorSet[i] == _addr) {
                return i;
            }
        }

        revert("No such a validator");
    }
}
