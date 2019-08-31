pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "./lib/interface/IGuard.sol";

contract Guard is IGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct WithdrawIntent {
        uint amount;
        uint unlockTime;
    }

    struct Delegator {
        uint lockedStake;
        WithdrawIntent[] withdrawIntents;
        uint nextWithdrawIntent;
    }

    struct ValidatorCandidate {
        bytes sidechainAddr;

        uint totalLockedStake;
        // TODO: do we need address[] delegators?
        mapping (address => Delegator) delegatorProfiles;
    }

    uint public constant VALIDATOR_SET_MAX_SIZE = 11;

    IERC20 public celerToken;
    // subscription fee per block
    uint public feePerBlock;
    uint public withdrawTimeout;
    uint public minSelfStake
    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    // struct ValidatorCandidate includes a mapping and therefore candidateProfiles can't be public
    mapping (address => ValidatorCandidate) private candidateProfiles;
    // consumer subscription
    mapping (address => uint) public subscriptionExpiration;

    modifier nonNullAddr(address _addr) {
        require(_addr != address(0), "0 address");
        _;
    }

    constructor(
        address _celerTokenAddress,
        uint _feePerBlock,
        uint _withdrawTimeout
    )
        public
    {
        celerToken = IERC20(_celerTokenAddress);
        feePerBlock = _feePerBlock;
        withdrawTimeout = _withdrawTimeout;
    }

    function stake(uint _amount, address _candidate) external nonNullAddr(_candidate) {
        ValidatorCandidate storage candidate = candidateProfiles[_candidate];

        address msgSender = msg.sender;
        
        candidate.delegatorProfiles[msgSender].lockedStake =
            candidate.delegatorProfiles[msgSender].lockedStake.add(_amount);
        candidate.totalLockedStake =
            candidate.totalLockedStake.add(_amount);

        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit Stake(msgSender, _candidate, _amount, candidate.totalLockedStake);
    }

    function claimValidator(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;
        
        candidateProfiles[msgSender].sidechainAddr = _sidechainAddr;

        uint minStakeIndex = 0;
        uint minStake = candidateProfiles[validatorSet[0]].totalLockedStake;
        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == msgSender) {
                // if the claimer is already in validator set, we only need to update its profile
                emit ValidatorChange(msgSender, _sidechainAddr, ValidatorChangeType.UpdateInfo);
                return;
            } else {
                if (candidateProfiles[validatorSet[i]].totalLockedStake < minStake) {
                    minStakeIndex = i;
                    minStake = candidateProfiles[validatorSet[i]].totalLockedStake;
                }
            }
        }

        require(candidateProfiles[msgSender].totalLockedStake > minStake, "Not enough stake");

        address removedValidator = validatorSet[minStakeIndex];
        if (removedValidator != address(0)) {
            emit ValidatorChange(
                removedValidator,
                candidateProfiles[removedValidator].sidechainAddr,
                ValidatorChangeType.Removal
            );
        }
        emit ValidatorChange(msgSender, _sidechainAddr, ValidatorChangeType.Add);
        validatorSet[minStakeIndex] = msgSender;
    }

    function intendWithdraw(uint _amount, address _candidate) external nonNullAddr(_candidate) {
        address msgSender = msg.sender;

        ValidatorCandidate storage candidate = candidateProfiles[_candidate];

        WithdrawIntent memory withdrawIntent;
        withdrawIntent.amount = _amount;
        withdrawIntent.unlockTime = block.timestamp.add(withdrawTimeout);
        candidate.delegatorProfiles[msgSender].withdrawIntents.push(withdrawIntent);

        emit IntendWithdraw(msgSender, _candidate, _amount, withdrawIntent.unlockTime);
    }

    function confirmWithdraw(address _candidate) external nonNullAddr(_candidate) {
        address msgSender = msg.sender;

        Delegator storage delegator = candidateProfiles[_candidate].delegatorProfiles[msgSender];

        uint intentLen = delegator.withdrawIntents.length;
        uint ts = block.timestamp;
        uint withdrawAmount = 0;
        for (uint i = delegator.nextWithdrawIntent; i < intentLen; i++) {
            if (ts > delegator.withdrawIntents[i].unlockTime) {
                withdrawAmount = withdrawAmount.add(delegator.withdrawIntents[i].amount);
            } else {
                delegator.nextWithdrawIntent = i;
                break;
            }
        }
        celerToken.safeTransfer(msgSender, withdrawAmount);

        emit ConfirmWithdraw(msgSender, _candidate, withdrawAmount);
    }

    function subscribe(uint _amount) external {
        address msgSender = msg.sender;
        uint delta = _amount.div(feePerBlock);

        if (subscriptionExpiration[msgSender] < block.number) {
            subscriptionExpiration[msgSender] = block.number.add(delta);
        }
        else {
            subscriptionExpiration[msgSender] = subscriptionExpiration[msgSender].add(delta);
        }
        celerToken.safeTransferFrom(
            msgSender,
            address(this),
            _amount
        );

        emit Subscription(msgSender, _amount, subscriptionExpiration[msgSender]);
    }

    // TODO
    // function punish(bytes calldata _punishRequest) external {
        // think about punish protobuf message
        // sidechain claims which delegators of a validator will be punished by what amount
    // }

    function isValidator(address _addr) public view returns (bool) {
        if (_addr == address(0)) {
            return false;
        }

        for (uint i = 0; i < VALIDATOR_SET_MAX_SIZE; i++) {
            if (validatorSet[i] == _addr) {
                return true;
            }
        }

        return false;
    }



    /******************** old function records ********************/
    // function punish(
    //     uint _cpNumber,
    //     bytes calldata _blockNumber,
    //     bytes calldata _headersProofBytes,
    //     bytes calldata _txIndex,
    //     bytes calldata _receiptsProofBytes
    // )
    //     external
    // {
    //     bytes[Len] memory logs = _merkleProof(_cpNumber, _blockNumber, _headersProofBytes, _txIndex, _receiptsProofBytes);

    //     bytes32 topic = _bytesToBytes32(RLP._decodeString(logs[1]), 0);
    //     require(topic == PunishEventHash, "not Punish event");

    //     bytes memory data = logs[2];

    //     address client = _bytesToAddress(RLP._slice(data, 12, 20), 0);

    //     uint cnt = _bytesToUint(RLP._slice(data, 32, 32));

    //     for (uint i = 0; i < cnt; i++) {
    //         address guardian = _bytesToAddress(RLP._slice(data, (i + 2) * 32 + 12, 32), 0);

    //         uint amount = securityDeposit[guardian];
    //         securityDeposit[guardian] = 0;

    //         celerToken.approve(client, amount);
    //         celerToken.safeTransfer(
    //             client,
    //             amount
    //         );
    //     }
    // }
}
