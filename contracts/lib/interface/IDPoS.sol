pragma solidity ^0.5.0;

/**
 * @title DPoS interface
 */
interface IDPoS {
    enum ValidatorChangeType { Add, Removal }

    // functions
    // TODO: interface can't be inherited, so VoteType is not declared here
    // function voteParam(uint _proposalId, VoteType _vote) external;

    // function confirmParamProposal(uint _proposalId) external;

    // function voteSidechain(uint _proposalId, VoteType _vote) external;

    // function confirmSidechainProposal(uint _proposalId) external;

    function contributeToMiningPool(uint _amount) external;

    function redeemMiningReward(address _receiver, uint _cumulativeReward) external;

    function registerSidechain(address _addr) external;

    function initializeCandidate(uint _minSelfStake, uint _commissionRate, uint _rateLockEndTime) external;

    function announceIncreaseCommissionRate(uint _newRate, uint _newLockEndTime) external;

    function confirmIncreaseCommissionRate() external;

    function nonIncreaseCommissionRate(uint _newRate, uint _newLockEndTime) external;

    function delegate(address _candidate, uint _amount) external;

    function claimValidator() external;

    function confirmUnbondedCandidate(address _candidateAddr) external;

    function withdrawFromUnbondedCandidate(address _candidateAddr, uint _amount) external;

    function intendWithdraw(address _candidate, uint _amount) external;

    function confirmWithdraw(address _candidateAddr) external;

    function punish(bytes calldata _penaltyRequest) external;

    function validateMultiSigMessage(bytes calldata _request) external returns(bool);

    function isValidDPoS() external view returns (bool);

    function isValidator(address _addr) external view returns (bool);

    function getValidatorNum() external view returns (uint);

    function getMinStakingPool() external view returns (uint);

    function getCandidateInfo(address _candidateAddr) external view returns (bool, uint, uint, uint, uint, uint, uint);

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) external view returns (uint, uint, uint[] memory, uint[] memory);

    function getMinQuorumStakingPool() external view returns(uint);

    function getTotalValidatorStakingPool() external view returns(uint);

    // events
    event InitializeCandidate(address indexed candidate, uint minSelfStake, uint commissionRate, uint rateLockEndTime);

    event CommissionRateAnnouncement(address candidate, uint announcedRate, uint announcedLockEndTime);

    event UpdateCommissionRate(uint newRate, uint newLockEndTime);

    event Delegate(address indexed delegator, address indexed candidate, uint newStake, uint stakingPool);

    event ValidatorChange(address indexed ethAddr, ValidatorChangeType indexed changeType);

    event WithdrawFromUnbondedCandidate(address indexed delegator, address indexed candidate, uint amount);

    event IntendWithdraw(address indexed delegator, address indexed candidate, uint withdrawAmount, uint proposedTime);

    event ConfirmWithdraw(address indexed delegator, address indexed candidate, uint amount);

    event Punish(address indexed validator, address indexed delegator, uint amount);

    event Indemnify(address indexed indemnitee, uint amount);

    event CandidateUnbonded(address indexed candidate);

    event RedeemMiningReward(address indexed receiver, uint reward, uint miningPool);

    event MiningPoolContribution(address indexed contributor, uint contribution, uint miningPoolSize);
}