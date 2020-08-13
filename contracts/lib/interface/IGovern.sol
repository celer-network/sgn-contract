pragma solidity ^0.5.0;

/**
 * @title Govern interface
 */
interface IGovern {
    enum ParamNames { ProposalDeposit, GovernVoteTimeout, BlameTimeout, MinValidatorNum, MaxValidatorNum, MinStakeInPool, AdvanceNoticePeriod }

    enum ProposalStatus { Uninitiated, Voting, Closed }

    enum VoteType { Unvoted, Yes, No, Abstain }

    // functions
    function getUIntValue(uint _record) external view returns (uint);

    function getParamProposalVote(uint _proposalId, address _voter) external view returns (VoteType);

    function isSidechainRegistered(address _sidechainAddr) external view returns (bool);

    function getSidechainProposalVote(uint _proposalId, address _voter) external view returns (VoteType);

    function createParamProposal(uint _record, uint _value) external;

    function registerSidechain(address _addr) external;

    function createSidechainProposal(address _sidechainAddr, bool _registered) external;

    // events
    event CreateParamProposal(uint proposalId, address proposer, uint deposit, uint voteDeadline, uint record, uint newValue);

    event VoteParam(uint proposalId, address voter, VoteType voteType);

    event ConfirmParamProposal(uint proposalId, bool passed, uint record, uint newValue);

    event CreateSidechainProposal(uint proposalId, address proposer, uint deposit, uint voteDeadline, address sidechainAddr, bool registered);

    event VoteSidechain(uint proposalId, address voter, VoteType voteType);

    event ConfirmSidechainProposal(uint proposalId, bool passed, address sidechainAddr, bool registered);
}
