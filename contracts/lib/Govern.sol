pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./interface/IGovern.sol";

/**
 * @title Governance module for DPoS contract
 * @notice Govern contract implements the basic governance logic
 * @dev DPoS contract should inherit this contract
 * @dev Some specific functions of governance are defined in DPoS contract
 */
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

    /**
     * @notice Govern constructor
     * @dev set governToken and initialize all parameters
     * @param _governTokenAddress address of the governance token
     * @param _governProposalDeposit required deposit amount for a governance proposal
     * @param _governVoteTimeout voting timeout for a governance proposal
     * @param _blameTimeout the locking timeout of funds for blaming malicious behaviors
     * @param _minValidatorNum the minimum number of validators
     * @param _maxValidatorNum the maximum number of validators
     * @param _minStakeInPool the global minimum requirement of staking pool for each validator
     * @param _advanceNoticePeriod the time after the announcement and prior to the effective time of an update
     */
    constructor(
        address _governTokenAddress,
        uint _governProposalDeposit,
        uint _governVoteTimeout,
        uint _blameTimeout,
        uint _minValidatorNum,
        uint _maxValidatorNum,
        uint _minStakeInPool,
        uint _advanceNoticePeriod
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
        UIntStorage[uint(ParamNames.AdvanceNoticePeriod)] = _advanceNoticePeriod;
    }

    /********** Get functions **********/
    /**
     * @notice Get the value of a specific uint parameter
     * @param _record the key of this parameter
     * @return the value of this parameter
     */
    function getUIntValue(uint _record) public view returns (uint) {
        return UIntStorage[_record];
    }

    /**
     * @notice Get the vote type of a voter on a parameter proposal
     * @param _proposalId the proposal id
     * @param _voter the voter address
     * @return the vote type of the given voter on the given parameter proposal
     */
    function getParamProposalVote(uint _proposalId, address _voter) public view returns (VoteType) {
        return paramProposals[_proposalId].votes[_voter];
    }

    /**
     * @notice Get whether a sidechain is registered or not
     * @param _sidechainAddr the sidechain contract address
     * @return whether the given sidechain is registered or not
     */
    function isSidechainRegistered(address _sidechainAddr) public view returns (bool) {
        return registeredSidechains[_sidechainAddr];
    }

    /**
     * @notice Get the vote type of a voter on a sidechain proposal
     * @param _proposalId the proposal id
     * @param _voter the voter address
     * @return the vote type of the given voter on the given sidechain proposal
     */
    function getSidechainProposalVote(uint _proposalId, address _voter) public view returns (VoteType) {
        return sidechainProposals[_proposalId].votes[_voter];
    }

    /********** Governance functions **********/
    /**
     * @notice Create a parameter proposal
     * @param _record the key of this parameter
     * @param _value the new proposed value of this parameter
     */
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

    /**
     * @notice Internal function to vote for a parameter proposal
     * @dev Must be used in DPoS contract
     * @param _proposalId the proposal id
     * @param _voter the voter address
     * @param _vote the vote type
     */
    function internalVoteParam(uint _proposalId, address _voter, VoteType _vote) internal {
        ParamProposal storage p = paramProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number < p.voteDeadline, "Vote deadline reached");
        require(p.votes[_voter] == VoteType.Unvoted, "Voter has voted");

        p.votes[_voter] = _vote;

        emit VoteParam(_proposalId, _voter, _vote);
    }

    /**
     * @notice Internal function to confirm a parameter proposal
     * @dev Must be used in DPoS contract
     * @param _proposalId the proposal id
     * @param _passed proposal passed or not
     */
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

    //
    /**
     * @notice Register a sidechain by contract owner
     * @dev Owner can renounce Ownership if needed for this function
     * @param _addr the sidechain contract address
     */
    function registerSidechain(address _addr) external onlyOwner {
        registeredSidechains[_addr] = true;
    }

    /**
     * @notice Create a sidechain proposal
     * @param _sidechainAddr the sidechain contract address
     * @param _registered the new proposed registration status
     */
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

    /**
     * @notice Internal function to vote for a sidechain proposal
     * @dev Must be used in DPoS contract
     * @param _proposalId the proposal id
     * @param _voter the voter address
     * @param _vote the vote type
     */
    function internalVoteSidechain(uint _proposalId, address _voter, VoteType _vote) internal {
        SidechainProposal storage p = sidechainProposals[_proposalId];
        require(p.status == ProposalStatus.Voting, "Invalid proposal status");
        require(block.number < p.voteDeadline, "Vote deadline reached");
        require(p.votes[_voter] == VoteType.Unvoted, "Voter has voted");

        p.votes[_voter] = _vote;

        emit VoteSidechain(_proposalId, _voter, _vote);
    }

    /**
     * @notice Internal function to confirm a sidechain proposal
     * @dev Must be used in DPoS contract
     * @param _proposalId the proposal id
     * @param _passed proposal passed or not
     */
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
