pragma solidity ^0.5.0;

interface IGuard {
    enum ValidatorChangeType { Add, Removal }

    // functions
    function initializeCandidate(uint _minSelfStake, bytes calldata _sidechainAddr) external;

    function delegate(address _candidate, uint _amount) external;

    function updateSidechainAddr(bytes calldata _sidechainAddr) external;

    function claimValidator() external;

    function confirmUnbondedCandidate(address _candidateAddr) external;

    function intendWithdraw(address _candidate, uint _amount) external;

    function confirmWithdraw(address _candidateAddr) external;

    function punish(bytes calldata _penaltyRequest) external;

    function subscribe(uint _amount) external;

    function isValidator(address _addr) external view returns (bool);

    function getValidatorNum() external view returns (uint);

    function getMinStake() external view returns (uint);

    function getCandidateInfo(address _candidateAddr) external view returns (bool, uint, bytes memory, uint, bool);

    function getDelegatorInfo(address _candidateAddr, address _delegatorAddr) external view returns (uint, uint, uint[] memory, uint[] memory);

    // events
    event InitializeCandidate(address indexed candidate, uint minSelfStake, bytes indexed sidechainAddr);

    event Delegate(address indexed delegator, address indexed candidate, uint newStake, uint totalStake);

    event UpdateSidechainAddr(address indexed candidate, bytes indexed oldSidechainAddr, bytes indexed newSidechainAddr);

    event ValidatorChange(address indexed ethAddr, ValidatorChangeType indexed changeType);
    
    event WithdrawFromUnbondedCandidate(address indexed delegator, address indexed candidate, uint amount);

    event IntendWithdraw(address indexed delegator, address indexed candidate, uint withdrawAmount, uint intendTime);

    event ConfirmWithdraw(address indexed delegator, address indexed candidate, uint amount);

    event AddSubscriptionBalance(address indexed consumer, uint amount);

    event Punish(address indexed validator, address indexed delegator, uint amount);

    event Indemnify(address indexed indemnitee, uint amount);

    event CandidateUnbonded(address indexed candidate);
}