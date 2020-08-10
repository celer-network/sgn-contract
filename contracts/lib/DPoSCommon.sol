pragma solidity ^0.5.0;

/**
 * @title DPoS contract common Library
 * @notice Common items used in DPoS contract
 */
library DPoSCommon {
    // Unbonded: not a validator and not responsible for previous validator behaviors if any.
    //   Delegators now are free to withdraw stakes (directly).
    // Bonded: active validator. Delegators has to wait for blameTimeout to withdraw stakes.
    // Unbonding: transitional status from Bonded to Unbonded. Candidate has lost the right of
    //   validator but is still responsible for any misbehavors done during being validator.
    //   Delegators should wait until candidate's unbondTime to freely withdraw stakes.
    enum CandidateStatus { Unbonded, Bonded, Unbonding }
}