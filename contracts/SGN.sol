pragma solidity ^0.5.0;

import 'openzeppelin-solidity/contracts/math/SafeMath.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';
import 'openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol';
import 'openzeppelin-solidity/contracts/cryptography/ECDSA.sol';
import 'openzeppelin-solidity/contracts/lifecycle/Pausable.sol';
import 'openzeppelin-solidity/contracts/ownership/Ownable.sol';
import './lib/interface/ISGN.sol';
import './lib/interface/IDPoS.sol';
import './lib/data/PbSgn.sol';
import './lib/DPoSCommon.sol';

/**
 * @title Sidechain contract of State Guardian Network
 * @notice This contract implements the mainchain logic of Celer State Guardian Network sidechain
 * @dev specs: https://www.celer.network/docs/celercore/sgn/sidechain.html#mainchain-contracts
 */
contract SGN is ISGN, Ownable, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct ValidatorCandidate {
        bytes sidechainAddr;
    }

    IERC20 public celerToken;
    IDPoS public DPoSContract;
    mapping(address => uint256) public subscriptionDeposits;
    uint256 public servicePool;
    mapping(address => uint256) public redeemedServiceReward;
    mapping(address => bytes) public sidechainAddrMap;

    /**
     * @notice Throws if the given address is zero address
     * @param _addr address to be checked
     */
    modifier onlyNonZeroAddr(address _addr) {
        require(_addr != address(0), '0 address');
        _;
    }

    /**
     * @notice Throws if SGN sidechain is not valid
     * @dev Check this before sidechain's operations
     */
    modifier onlyValidSidechain() {
        require(DPoSContract.isValidDPoS(), 'DPoS is not valid');
        _;
    }

    /**
     * @notice SGN constructor
     * @dev Need to deploy DPoS contract first before deploying SGN contract
     * @param _celerTokenAddress address of Celer Token Contract
     * @param _DPoSAddress address of DPoS Contract
     */
    constructor(address _celerTokenAddress, address _DPoSAddress) public {
        celerToken = IERC20(_celerTokenAddress);
        DPoSContract = IDPoS(_DPoSAddress);
    }

    /**
     * @notice Onwer drains one type of tokens when the contract is paused
     * @dev This is for emergency situations.
     * @param _amount drained token amount
     */
    function drainToken(uint256 _amount) external whenPaused onlyOwner {
        celerToken.safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice Update sidechain address
     * @dev Note that the "sidechain address" here means the address in the offchain sidechain system,
         which is different from the sidechain contract address
     * @param _sidechainAddr the new address in the offchain sidechain system
     */
    function updateSidechainAddr(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;

        (bool initialized, , , uint256 status, , , ) = DPoSContract
            .getCandidateInfo(msgSender);
        require(
            status == uint256(DPoSCommon.CandidateStatus.Unbonded),
            'msg.sender is not unbonded'
        );
        require(initialized, 'Candidate is not initialized');

        bytes memory oldSidechainAddr = sidechainAddrMap[msgSender];
        sidechainAddrMap[msgSender] = _sidechainAddr;

        emit UpdateSidechainAddr(msgSender, oldSidechainAddr, _sidechainAddr);
    }

    /**
     * @notice Subscribe the guardian service
     * @param _amount subscription fee paid along this function call in CELR tokens
     */
    function subscribe(uint256 _amount)
        external
        whenNotPaused
        onlyValidSidechain
    {
        address msgSender = msg.sender;

        servicePool = servicePool.add(_amount);
        subscriptionDeposits[msgSender] = subscriptionDeposits[msgSender].add(
            _amount
        );

        celerToken.safeTransferFrom(msgSender, address(this), _amount);

        emit AddSubscriptionBalance(msgSender, _amount);
    }

    /**
     * @notice Redeem rewards
     * @dev The rewards include both the service reward and mining reward
     * @dev SGN contract acts as an interface for users to redeem mining rewards
     * @param _rewardRequest reward request bytes coded in protobuf
     */
    function redeemReward(bytes calldata _rewardRequest)
        external
        whenNotPaused
        onlyValidSidechain
    {
        require(
            DPoSContract.validateMultiSigMessage(_rewardRequest),
            'Fail to check validator sigs'
        );

        PbSgn.RewardRequest memory rewardRequest = PbSgn.decRewardRequest(
            _rewardRequest
        );
        PbSgn.Reward memory reward = PbSgn.decReward(rewardRequest.reward);
        uint256 newServiceReward = reward.cumulativeServiceReward.sub(
            redeemedServiceReward[reward.receiver]
        );
        redeemedServiceReward[reward.receiver] = reward.cumulativeServiceReward;

        servicePool = servicePool.sub(newServiceReward);

        DPoSContract.redeemMiningReward(
            reward.receiver,
            reward.cumulativeMiningReward
        );
        celerToken.safeTransfer(reward.receiver, newServiceReward);

        emit RedeemReward(
            reward.receiver,
            reward.cumulativeMiningReward,
            newServiceReward,
            servicePool
        );
    }
}
