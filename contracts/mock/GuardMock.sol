pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "../lib/interface/IGuard.sol";

contract GuardMock is IGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    enum Operation { Stake, Withdraw }

    struct ValidatorCandidate {
        uint stakes;
        bytes sidechainAddr;
    }

    struct WithdrawIntent {
        address candidate;
        uint amount;
    }

    struct Delegator {
        // from eth address of supported validator candidate to token amount delegator staked
        mapping (address => uint) stakeMap;
        // this is for mock purpose
        WithdrawIntent withdrawIntent;
    }

    uint public constant VALIDATOR_SET_MAX_SIZE = 11;

    IERC20 public celerToken;
    address[VALIDATOR_SET_MAX_SIZE] public validatorSet;
    mapping (address => ValidatorCandidate) public candidateProfiles;
    // struct Delegator includes a mapping and therefore delegatorProfiles can't be public
    mapping (address => Delegator) private delegatorProfiles;
    // subscription fee per block
    uint public feePerBlock;
    // consumer subscription
    mapping (address => uint) public subscriptionExpiration;

    constructor() public {
        feePerBlock = 10;
    }

    function stake(uint _amount, address _candidate) external {
        address msgSender = msg.sender;
        _updateStake(msgSender, _candidate, _amount, Operation.Stake);

        emit Stake(msgSender, _candidate, _amount, candidateProfiles[_candidate].stakes);
    }

    function claimValidator(bytes calldata _sidechainAddr) external {
        address msgSender = msg.sender;
        candidateProfiles[msgSender].sidechainAddr = _sidechainAddr;

        emit ValidatorUpdate(msgSender, _sidechainAddr, true);
    }

    function intendWithdraw(uint _amount, address _candidate) external {
        address msgSender = msg.sender;
        delegatorProfiles[msgSender].withdrawIntent.candidate = _candidate;
        delegatorProfiles[msgSender].withdrawIntent.amount = _amount;

        emit IntendWithdraw(msgSender, _candidate, _amount);
    }

    function confirmWithdraw() external {
        address msgSender = msg.sender;
        _updateStake(
            msgSender,
            delegatorProfiles[msgSender].withdrawIntent.candidate,
            delegatorProfiles[msgSender].withdrawIntent.amount,
            Operation.Withdraw
        );

        emit ConfirmWithdraw(
            msgSender,
            delegatorProfiles[msgSender].withdrawIntent.candidate,
            delegatorProfiles[msgSender].withdrawIntent.amount
        );
    }

    function punish(bytes calldata _punishRequest) external {
        address mockIndemnitor = 0xE0B6b1E22182ae2b8382BAC06F5392dAd89EBf04;
        address mockIndemnitee = 0xF0D9FcB4FefdBd3e7929374b4632f8AD511BD7e3;
        uint mockAmount = 100;

        mockPunish(mockIndemnitor, mockIndemnitee, mockAmount);
    }

    function mockPunish(address _indemnitor, address _indemnitee, uint _amount) public {
         _updateStake(
            _indemnitor,
            _indemnitor,
            _amount,
            Operation.Withdraw
        );

        // transfer to _indemnitee

        emit Punish(_indemnitor, _indemnitee, _amount);
    }

    function subscribe(uint _amount) external {
        address msgSender = msg.sender;
        uint delta = _amount / feePerBlock;

        if (subscriptionExpiration[msgSender] < block.number) {
            subscriptionExpiration[msgSender] = block.number + delta;
        }
        else {
            subscriptionExpiration[msgSender] += delta;
        }

        emit Subscription(msgSender, _amount, subscriptionExpiration[msgSender]);
    }

    function _updateStake(
        address _delegator,
        address _candidate,
        uint _amount,
        Operation _op
    )
        private
    {
        if (_op == Operation.Stake) {
            delegatorProfiles[_delegator].stakeMap[_candidate] += _amount;
            candidateProfiles[_candidate].stakes += _amount;
        } else if (_op == Operation.Withdraw) {
            delegatorProfiles[_delegator].stakeMap[_candidate] -= _amount;
            candidateProfiles[_candidate].stakes -= _amount;
        } else {
            revert("Invalid operation");
        }
    }
}
