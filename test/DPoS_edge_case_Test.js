const DPoS = artifacts.require('DPoS');
const CELRToken = artifacts.require('CELRToken');

const GANACHE_ACCOUNT_NUM = 5; // defined in .circleci/config.yml
const GOVERN_PROPOSAL_DEPOSIT = 100;
const GOVERN_VOTE_TIMEOUT = 20;
const BLAME_TIMEOUT = 50;
const MIN_VALIDATOR_NUM = 1;
// need to be larger than CANDIDATE_STAKE for test purpose
const MIN_STAKING_POOL = 80;
const DPOS_GO_LIVE_TIMEOUT = 50;

const COMMISSION_RATE = 100;
const RATE_LOCK_END_TIME = 2;
const INCREASE_RATE_WAIT_TIME = 100; // in practice, this should be 80640 (2 weeks)
const MIN_SELF_STAKE = 20;
const MAX_VALIDATOR_NUM = 11;

const DELEGATOR_STAKE = 100;
// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('DPoS edge case', async accounts => {
    const DELEGATOR = accounts[0];
    const CANDIDATE = accounts[1];
    // CANDIDATE_STAKE - CANDIDATE_WITHDRAW_UNDER_MIN < MIN_SELF_STAKE

    let celerToken;
    // let instance;
    let dposInstance;

    beforeEach(async () => {
        celerToken = await CELRToken.new();

        dposInstance = await DPoS.new(
            celerToken.address,
            GOVERN_PROPOSAL_DEPOSIT,
            GOVERN_VOTE_TIMEOUT,
            BLAME_TIMEOUT,
            MIN_VALIDATOR_NUM,
            MAX_VALIDATOR_NUM,
            MIN_STAKING_POOL,
            INCREASE_RATE_WAIT_TIME,
            DPOS_GO_LIVE_TIMEOUT
        );

        // give enough money to other accounts
        for (let i = 1; i < GANACHE_ACCOUNT_NUM; i++) {
            await celerToken.transfer(accounts[i], 10000000);
        }
    });

    it('should getDelegatorInfo successfully', async () => {
        await dposInstance.initializeCandidate(
            MIN_SELF_STAKE,
            COMMISSION_RATE,
            RATE_LOCK_END_TIME,
            { from: CANDIDATE }
        );
        await celerToken.approve(dposInstance.address, 10 * DELEGATOR_STAKE);

        await dposInstance.delegate(CANDIDATE, 2 * DELEGATOR_STAKE);
        await dposInstance.intendWithdraw(CANDIDATE, DELEGATOR_STAKE);
        await dposInstance.confirmWithdraw(CANDIDATE);
        await dposInstance.delegate(CANDIDATE, 2 * DELEGATOR_STAKE);
        await dposInstance.intendWithdraw(CANDIDATE, DELEGATOR_STAKE);

        await dposInstance.getDelegatorInfo.call(CANDIDATE, DELEGATOR);
    });
});
