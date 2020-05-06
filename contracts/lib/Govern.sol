pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./interface/IGovern.sol";

contract Govern is IGovern {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct GovernProposal {
        address proposer;
        uint deposit;
        uint voteDeadline;
        uint record;
        uint newValue;
        ProposalStatus status;
        mapping(address => bool) voted;
        uint totalVotes;
    }

    IERC20 public governToken;
    mapping(uint => uint) public UIntStorage;
    mapping(uint => GovernProposal) public proposals;
    uint public nextProposalId;

    constructor(
        address _governTokenAddress,
        uint _governProposalDeposit,
        uint _governVoteTimeout,
        uint _blameTimeout,
        uint _minValidatorNum,
        uint _maxValidatorNum,
        uint _minStakeInPool,
        uint _increaseRateWaitTime
    )
        public
    {
        governToken = IERC20(_governTokenAddress);

        UIntStorage[uint(ParamNames.GovernProposalDeposit)] = _governProposalDeposit;
        UIntStorage[uint(ParamNames.GovernVoteTimeout)] = _governVoteTimeout;
        UIntStorage[uint(ParamNames.BlameTimeout)] = _blameTimeout;
        UIntStorage[uint(ParamNames.MinValidatorNum)] = _minValidatorNum;
        UIntStorage[uint(ParamNames.MaxValidatorNum)] = _maxValidatorNum;
        UIntStorage[uint(ParamNames.MinStakeInPool)] = _minStakeInPool;
        UIntStorage[uint(ParamNames.IncreaseRateWaitTime)] = _increaseRateWaitTime;
    }

    /********** Get functions **********/
    function getUIntValue(uint _record) public view returns (uint) {
        return UIntStorage[_record];
    }

    /********** Set functions **********/
    function setUIntValue(uint _record, uint _value) private {
        UIntStorage[_record] = _value;
    }

    /********** Governance functions **********/
    function createProposal(uint _record, uint _value) public {
        // TODO: _governVoteTimeout < _blameTimeout
        GovernProposal storage p = proposals[nextProposalId];
        nextProposalId = nextProposalId.add(1);
        address msgSender = msg.sender;
        uint deposit = UIntStorage[uint(ParamNames.GovernProposalDeposit)];
        
        p.proposer = msgSender;
        p.deposit = deposit;
        p.voteDeadline = block.number.add(UIntStorage[uint(ParamNames.GovernVoteTimeout)]);
        p.record = _record;
        p.newValue = _value;
        p.status = ProposalStatus.Voting;

        governToken.safeTransferFrom(msgSender, address(this), deposit);

        emit CreateProposal(nextProposalId.sub(1), msgSender, deposit, p.voteDeadline, _record, _value);
    }

    function internalVote(uint _proposalId, address _voter, uint _votes) internal {
        GovernProposal storage p = proposals[_proposalId];
        require(block.number < p.voteDeadline, "Vote deadline reached");
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(!p.voted[_voter], "Voter has voted");

        p.totalVotes = p.totalVotes.add(_votes);

        emit Vote(_proposalId, _voter, _votes);
    }

    function internalConfirmProposal(uint _proposalId, uint _passVotes) internal {
        GovernProposal storage p = proposals[_proposalId];
        require(block.number >= p.voteDeadline, "Vote deadline not reached");
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");

        p.status = ProposalStatus.Closed;
        bool passed = p.totalVotes >= _passVotes;
        if (passed) {
            governToken.safeTransfer(p.proposer, p.deposit);
            UIntStorage[p.record] = p.newValue;
        }

        emit ConfirmProposal(_proposalId, passed, p.record, p.newValue);
    }
}
