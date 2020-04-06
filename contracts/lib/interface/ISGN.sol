pragma solidity ^0.5.0;

interface ISGN {
    // functions
    function contributeToMiningPool(uint _amount) external;

    function updateSidechainAddr(bytes calldata _sidechainAddr) external;

    function subscribe(uint _amount) external;

    function redeemReward(bytes calldata _rewardRequest) external;

    // events
    event MiningPoolContribution(address indexed contributor, uint contribution, uint miningPoolSize);

    event UpdateSidechainAddr(address indexed candidate, bytes indexed oldSidechainAddr, bytes indexed newSidechainAddr);

    event AddSubscriptionBalance(address indexed consumer, uint amount);

    event RedeemReward(address indexed receiver, uint miningReward, uint serviceReward, uint miningPool, uint servicePool);
}