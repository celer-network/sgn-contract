pragma solidity ^0.5.0;

/**
 * @title SGN interface
 */
interface ISGN {
    // functions
    function updateSidechainAddr(bytes calldata _sidechainAddr) external;

    function subscribe(uint _amount) external;

    function redeemReward(bytes calldata _rewardRequest) external;

    // events
    event UpdateSidechainAddr(address indexed candidate, bytes indexed oldSidechainAddr, bytes indexed newSidechainAddr);

    event AddSubscriptionBalance(address indexed consumer, uint amount);

    event RedeemReward(address indexed receiver, uint cumulativeMiningReward, uint serviceReward, uint servicePool);
}