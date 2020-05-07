pragma solidity ^0.5.0;

interface IGovern {
    enum ParamNames { ParamProposalDeposit, GovernVoteTimeout, BlameTimeout, MinValidatorNum, MaxValidatorNum, MinStakeInPool, IncreaseRateWaitTime }
    
    enum ProposalStatus { Uninitiated, Voting, Closed }

    enum VoteType { Unvoted, Yes, No, Abstain }

    // functions
    function getUIntValue(uint _record) external view returns (uint);

    function getParamProposalVote(uint _proposalId, address _voter) external view returns (VoteType);

    function createParamProposal(uint _record, uint _value) external;

    // events
    event CreateParamProposal(uint proposalId, address proposer, uint deposit, uint voteDeadline, uint record, uint newValue);

    event VoteParam(uint proposalId, address voter, VoteType voteType);

    event ConfirmParamProposal(uint proposalId, bool passed, uint record, uint newValue);
}