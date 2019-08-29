pragma solidity ^0.5.0;

interface IGuard {
    // functions
    function stake(uint _amount, address _candidate) external;

    function claimValidator(bytes calldata _sidechainAddr) external;

    function intendWithdraw(uint _amount, address _candidate) external;

    function confirmWithdraw() external;

    // function punish(bytes calldata _punishRequest) external;
    function punish(address _indemnitor, address _indemnitee, uint _amount) external;

    function subscribe(uint _amount) external;

    // events
    event Stake(address delegator, address candidate, uint newStake, uint totalStake);

    event ValidatorUpdate(address ethAddr, bytes sidechainAddr, bool added);

    event IntendWithdraw(address delegator, address candidate, uint amount);

    event ConfirmWithdraw(address delegator, address candidate, uint amount);

    event Punish(address indemnitor, address indemnitee, uint amount);

    event Subscription(address consumer, uint amount, uint subscriptionExpiration);
}