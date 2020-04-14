pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./lib/interface/ISGN.sol";
import "./lib/interface/IDPoS.sol";
import "./lib/data/PbSgn.sol";
import "./lib/DPoSCommon.sol";

contract SGN is ISGN {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct ValidatorCandidate {
        bytes sidechainAddr;
    }

    IERC20 public celerToken;
    IDPoS public DPoSContract;
    mapping (address => uint) public subscriptionDeposits;
    uint public servicePool;
    mapping (address => uint) public redeemedServiceReward;
    mapping (address => bytes) public sidechainAddrMap;

    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    // check this before sidechain's operation
    modifier onlyValidSidechain() {
        require(DPoSContract.isValidDPoS(), "DPoS is not valid");
        _;
    }

    constructor(address _celerTokenAddress, address _DPoSAddress) public {
        celerToken = IERC20(_celerTokenAddress);
        DPoSContract = IDPoS(_DPoSAddress);
    }

    function updateSidechainAddr(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;

        (bool initialized, , , uint status, ) = DPoSContract.getCandidateInfo(msgSender);
        require(
            status == uint(DPoSCommon.CandidateStatus.Unbonded),
            "msg.sender is not unbonded"
        );
        require(initialized, "Candidate is not initialized");

        bytes memory oldSidechainAddr = sidechainAddrMap[msgSender];
        sidechainAddrMap[msgSender] = _sidechainAddr;

        emit UpdateSidechainAddr(msgSender, oldSidechainAddr, _sidechainAddr);
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

    function redeemReward(bytes calldata _rewardRequest) external onlyValidSidechain {
        require(
            DPoSContract.validateMultiSigMessage(_rewardRequest),
            "Fail to check validator sigs"
        );

        PbSgn.RewardRequest memory rewardRequest = PbSgn.decRewardRequest(_rewardRequest);
        PbSgn.Reward memory reward = PbSgn.decReward(rewardRequest.reward);
        uint newServiceReward =
            reward.cumulativeServiceReward.sub(redeemedServiceReward[reward.receiver]);
        redeemedServiceReward[reward.receiver] = reward.cumulativeServiceReward;

        servicePool = servicePool.sub(newServiceReward);

        DPoSContract.redeemMiningReward(reward.receiver, reward.cumulativeMiningReward);
        celerToken.safeTransfer(reward.receiver, newServiceReward);

        emit RedeemReward(reward.receiver, reward.cumulativeMiningReward, newServiceReward, servicePool);
    }
}
