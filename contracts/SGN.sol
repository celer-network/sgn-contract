pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "./lib/interface/ISGN.sol";
import "./lib/interface/IDPoS.sol";
import "./lib/data/PbSgn.sol";

contract SGN is ISGN {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct ValidatorCandidate {
        bytes sidechainAddr;
    }

    IERC20 public celerToken;
    address public DPoSContract;
    mapping (address => uint) public subscriptionDeposits;
    uint public servicePool;
    mapping (address => uint) public redeemedServiceReward;
    uint public miningPool;
    mapping (address => uint) public redeemedMiningReward;
    mapping (address => bytes) public sidechainAddrMap;

    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    // check this before sidechain's operation
    modifier onlyValidSidechain() {
        // TODO: call DPoS to check the validity. DPoS needs to add a view function
        _;
    }

    constructor(
        address _celerTokenAddress,
        address _DPoSAddress,
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        DPoSContract = IDPoS(_DPoSAddress);
    }

    function contributeToMiningPool(uint _amount) public {
        address msgSender = msg.sender;
        miningPool = miningPool.add(_amount);
        celerToken.safeTransferFrom(msgSender, address(this), _amount);

        emit MiningPoolContribution(msgSender, _amount, miningPool);
    }

    function updateSidechainAddr(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;

        // TODO: call DPoS view function to check candidate status
        require(
            // candidateProfiles[msgSender].status == CandidateStatus.Unbonded,
            "msg.sender is not unbonded"
        );
        ValidatorCandidate storage candidate = candidateProfiles[msgSender];
        require(candidate.initialized, "Candidate is not initialized");

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
        PbSgn.RewardRequest memory rewardRequest = PbSgn.decRewardRequest(_rewardRequest);
        PbSgn.Reward memory reward = PbSgn.decReward(rewardRequest.reward);

        // TODO: call DPoS view function to check sigs
        // bytes [] might be an issue
        bytes32 h = keccak256(rewardRequest.reward);
        require(
            _checkValidatorSigs(h, rewardRequest.sigs),
            "Fail to check validator sigs"
        );

        uint newMiningReward =
            reward.cumulativeMiningReward.sub(redeemedMiningReward[reward.receiver]);
        redeemedMiningReward[reward.receiver] = reward.cumulativeMiningReward;
        uint newServiceReward =
            reward.cumulativeServiceReward.sub(redeemedServiceReward[reward.receiver]);
        redeemedServiceReward[reward.receiver] = reward.cumulativeServiceReward;

        miningPool = miningPool.sub(newMiningReward);
        servicePool = servicePool.sub(newServiceReward);

        celerToken.safeTransfer(reward.receiver, newMiningReward.add(newServiceReward));

        emit RedeemReward(reward.receiver, newMiningReward, newServiceReward, miningPool, servicePool);
    }
}
