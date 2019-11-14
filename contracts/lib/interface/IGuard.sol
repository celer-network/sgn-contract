pragma solidity ^0.5.0;

interface IGuard {
    enum ValidatorChangeType { Add, Removal }

    // functions
    function contributeToMiningPool(uint _amount) external;

    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external;

    function delegate(address _candidate, uint _amount) external;

    function updateSidechainAddr(bytes calldata _sidechainAddr) external;

    function claimValidator() external;

    function confirmUnbondedCandidate(address _candidateAddr) external;

    function withdrawFromUnbondedCandidate(address _candidateAddr, uint _amount) external;

    function intendWithdraw(address _candidate, uint _amount) external;

    function confirmWithdraw(address _candidateAddr) external;

    function subscribe(uint _amount) external;

    function punish(bytes calldata _penaltyRequest) external;

    function redeemReward(bytes calldata _rewardRequest) external;

    function isValidator(address _addr) external view returns (bool);

    function getValidatorNum() external view returns (uint);

    function getMinStakingPool() external view returns (uint);

    function getCandidateInfo(address _candidateAddr) external view returns (bool, uint, bytes memory, uint, uint, uint);

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) external view returns (uint, uint, uint[] memory, uint[] memory);

    function getMinQuorumStakingPool() external view returns(uint);

    // events
    event MiningPoolContribution(address indexed contributor, uint contribution, uint miningPoolSize);

    event InitializeCandidate(address indexed candidate, uint minSelfStake, bytes sidechainAddr);

    event Delegate(address indexed delegator, address indexed candidate, uint newStake, uint stakingPool);

    event UpdateSidechainAddr(address indexed candidate, bytes indexed oldSidechainAddr, bytes indexed newSidechainAddr);

    event ValidatorChange(address indexed ethAddr, ValidatorChangeType indexed changeType);

    event WithdrawFromUnbondedCandidate(address indexed delegator, address indexed candidate, uint amount);

    event IntendWithdraw(address indexed delegator, address indexed candidate, uint withdrawAmount, uint proposedTime);

    event ConfirmWithdraw(address indexed delegator, address indexed candidate, uint amount);

    event AddSubscriptionBalance(address indexed consumer, uint amount);

    event Punish(address indexed validator, address indexed delegator, uint amount);

    event Indemnify(address indexed indemnitee, uint amount);

    event CandidateUnbonded(address indexed candidate);

    event RedeemReward(address indexed receiver, uint miningReward, uint serviceReward, uint miningPool, uint servicePool);
}