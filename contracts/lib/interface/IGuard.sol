pragma solidity ^0.5.0;

interface IGuard {
    enum ValidatorChangeType { Add, Removal, UpdateInfo }

    // functions
    function stake(uint _amount, address _candidate) external;

    function claimValidator(bytes calldata _sidechainAddr) external;

    function intendWithdraw(uint _amount, address _candidate) external;

    function confirmWithdraw() external;

    // TODO
    // function punish(bytes calldata _punishRequest) external;

    function subscribe(uint _amount) external;

    // events
    event Stake(address indexed delegator, address indexed candidate, uint newStake, uint totalStake);

    event ValidatorChange(address indexed ethAddr, bytes indexed sidechainAddr, ValidatorChangeType changeType);

    event IntendWithdraw(address indexed delegator, address indexed candidate, uint amount, uint unlockTime);

    event ConfirmWithdraw(address indexed delegator, address indexed candidate, uint amount);

    event Punish(address indexed indemnitor, address indexed indemnitee, uint amount);

    event Subscription(address indexed consumer, uint amount, uint subscriptionExpiration);
}