pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./interface/IGovern.sol";

contract Govern is IGovern, Ownable {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct ParamProposal {
        address proposer;
        uint deposit;
        uint voteDeadline;
        uint record;
        uint newValue;
        ProposalStatus status;
        mapping(address => VoteType) votes;
    }

    struct SidechainProposal {
        address proposer;
        uint deposit;
        uint voteDeadline;
        address sidechainAddr;
        bool registered;
        ProposalStatus status;
        mapping(address => VoteType) votes;
    }

    IERC20 public governToken;
    // parameters
    mapping(uint => uint) public UIntStorage;
    mapping(uint => ParamProposal) public paramProposals;
    uint public nextParamProposalId;
    // registered sidechain addresses
    mapping (address => bool) public registeredSidechains;
    mapping(uint => SidechainProposal) public sidechainProposals;
    uint public nextSidechainProposalId;


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

        UIntStorage[uint(ParamNames.ProposalDeposit)] = _governProposalDeposit;
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

    function getParamProposalVote(uint _proposalId, address _voter) public view returns (VoteType) {
        return paramProposals[_proposalId].votes[_voter];
    }

    function isSidechainRegistered(address _sidechainAddr) public view returns (bool) {
        return registeredSidechains[_sidechainAddr];
    }

    function getSidechainProposalVote(uint _proposalId, address _voter) public view returns (VoteType) {
        return sidechainProposals[_proposalId].votes[_voter];
    }

    /********** Governance functions **********/
    function createParamProposal(uint _record, uint _value) public {
        ParamProposal storage p = paramProposals[nextParamProposalId];
        nextParamProposalId = nextParamProposalId.add(1);
        address msgSender = msg.sender;
        uint deposit = UIntStorage[uint(ParamNames.ProposalDeposit)];
        
        p.proposer = msgSender;
        p.deposit = deposit;
        p.voteDeadline = block.number.add(UIntStorage[uint(ParamNames.GovernVoteTimeout)]);
        p.record = _record;
        p.newValue = _value;
        p.status = ProposalStatus.Voting;

        governToken.safeTransferFrom(msgSender, address(this), deposit);

        emit CreateParamProposal(nextParamProposalId.sub(1), msgSender, deposit, p.voteDeadline, _record, _value);
    }

    function internalVoteParam(uint _proposalId, address _voter, VoteType _vote) internal {
        ParamProposal storage p = paramProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number < p.voteDeadline, "Vote deadline reached");
        require(p.votes[_voter] == VoteType.Unvoted, "Voter has voted");

        p.votes[_voter] = _vote;

        emit VoteParam(_proposalId, _voter, _vote);
    }

    function internalConfirmParamProposal(uint _proposalId, bool _passed) internal {
        ParamProposal storage p = paramProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number >= p.voteDeadline, "Vote deadline not reached");

        p.status = ProposalStatus.Closed;
        if (_passed) {
            governToken.safeTransfer(p.proposer, p.deposit);
            UIntStorage[p.record] = p.newValue;
        }

        emit ConfirmParamProposal(_proposalId, _passed, p.record, p.newValue);
    }

    // Owner can renounce Ownership if needed for this function
    function registerSidechain(address _addr) external onlyOwner {
        registeredSidechains[_addr] = true;
    }

    function createSidechainProposal(address _sidechainAddr, bool _registered) public {
        SidechainProposal storage p = sidechainProposals[nextSidechainProposalId];
        nextSidechainProposalId = nextSidechainProposalId.add(1);
        address msgSender = msg.sender;
        uint deposit = UIntStorage[uint(ParamNames.ProposalDeposit)];
        
        p.proposer = msgSender;
        p.deposit = deposit;
        p.voteDeadline = block.number.add(UIntStorage[uint(ParamNames.GovernVoteTimeout)]);
        p.sidechainAddr = _sidechainAddr;
        p.registered = _registered;
        p.status = ProposalStatus.Voting;

        governToken.safeTransferFrom(msgSender, address(this), deposit);

        emit CreateSidechainProposal(nextSidechainProposalId.sub(1), msgSender, deposit, p.voteDeadline, _sidechainAddr, _registered);
    }

    function internalVoteSidechain(uint _proposalId, address _voter, VoteType _vote) internal {
        SidechainProposal storage p = sidechainProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number < p.voteDeadline, "Vote deadline reached");
        require(p.votes[_voter] == VoteType.Unvoted, "Voter has voted");

        p.votes[_voter] = _vote;

        emit VoteSidechain(_proposalId, _voter, _vote);
    }

    function internalConfirmSidechainProposal(uint _proposalId, bool _passed) internal {
        SidechainProposal storage p = sidechainProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number >= p.voteDeadline, "Vote deadline not reached");

        p.status = ProposalStatus.Closed;
        if (_passed) {
            governToken.safeTransfer(p.proposer, p.deposit);
            registeredSidechains[p.sidechainAddr] = p.registered;
        }

        emit ConfirmSidechainProposal(_proposalId, _passed, p.sidechainAddr, p.registered);
    }
}
