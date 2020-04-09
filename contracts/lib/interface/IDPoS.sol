pragma solidity ^0.5.0;

interface IDPoS {
    enum ValidatorChangeType { Add, Removal }

    // functions
    function contributeToMiningPool(uint _amount) external;

    function registerSidechain(address _addr) external;

    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external;

    function delegate(address _candidate, uint _amount) external;

    function claimValidator() external;

    function confirmUnbondedCandidate(address _candidateAddr) external;

    function withdrawFromUnbondedCandidate(address _candidateAddr, uint _amount) external;

    function intendWithdraw(address _candidate, uint _amount) external;

    function confirmWithdraw(address _candidateAddr) external;

    function punish(bytes calldata _penaltyRequest) external;

    function redeemMiningReward(address _receiver, uint _cumulativeReward) external;

    function checkValidatorSigs(bytes32 _h, bytes[] calldata _sigs) external returns(bool);

    function isValidDPoS() external view returns (bool);

    function isValidator(address _addr) external view returns (bool);

    function getValidatorNum() external view returns (uint);

    function getMinStakingPool() external view returns (uint);

    function getCandidateInfo(address _candidateAddr) external view returns (bool, uint, uint, uint, uint);

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) external view returns (uint, uint, uint[] memory, uint[] memory);

    function getMinQuorumStakingPool() external view returns(uint);

    function getTotalValidatorStakingPool() external view returns(uint);

    function validateMultiSigMessage(bytes calldata _request) external view returns(bool);

    // events
    event InitializeCandidate(address indexed candidate, uint minSelfStake);

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