pragma solidity ^0.5.0;

interface IGovern {
    enum ParamNames { GovernProposalDeposit, GovernVoteTimeout, BlameTimeout, MinValidatorNum, MaxValidatorNum, MinStakeInPool, IncreaseRateWaitTime }
    enum ProposalStatus { Uninitiated, Voting, Closed }

    // functions
    function getUIntValue(uint _record) external view returns (uint);

    function createProposal(uint _record, uint _value) external;

    // events
    event CreateProposal(uint proposalId, address proposer, uint deposit, uint voteDeadline, uint record, uint newValue);

    event Vote(uint proposalId, address voter, uint votes);

    event ConfirmProposal(uint proposalId, bool passed, uint record, uint newValue);
}