const DPoS = artifacts.require('DPoS');
const CELRToken = artifacts.require('CELRToken');

const GANACHE_ACCOUNT_NUM = 5;
const GOVERN_PROPOSAL_DEPOSIT = 100;
const GOVERN_VOTE_TIMEOUT = 20;
const SLASH_TIMEOUT = 50;
const MIN_VALIDATOR_NUM = 1;
const MIN_STAKING_POOL = 80;
const DPOS_GO_LIVE_TIMEOUT = 50;

const COMMISSION_RATE = 100;
const RATE_LOCK_END_TIME = 2;
const ADVANCE_NOTICE_PERIOD = 100; // in practice, this should be 80640 (2 weeks)
const MIN_SELF_STAKE = 20;
const MAX_VALIDATOR_NUM = 11;

const DELEGATOR_STAKE = '2000000000000000000';
const WITHDRAW_STAKE = '1000000000000000000';

contract('DPoS edge case', async accounts => {
  const DELEGATOR = accounts[0];
  const CANDIDATE = accounts[1];

  let celerToken;
  let dposInstance;

  beforeEach(async () => {
    celerToken = await CELRToken.new();

    dposInstance = await DPoS.new(
      celerToken.address,
      GOVERN_PROPOSAL_DEPOSIT,
      GOVERN_VOTE_TIMEOUT,
      SLASH_TIMEOUT,
      MIN_VALIDATOR_NUM,
      MAX_VALIDATOR_NUM,
      MIN_STAKING_POOL,
      ADVANCE_NOTICE_PERIOD,
      DPOS_GO_LIVE_TIMEOUT
    );

    // give enough money to other accounts
    for (let i = 1; i < GANACHE_ACCOUNT_NUM; i++) {
      await celerToken.transfer(accounts[i], '4000000000000000000');
    }
  });

  it('should fail to drain token for unpaused state', async () => {
    await celerToken.transfer(dposInstance.address, 10);

    try {
      await dposInstance.drainToken(10);
    } catch (e) {
      assert.isAbove(
        e.message.search('VM Exception while processing transaction'),
        -1
      );
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should drainToken successfully after pauce contract', async () => {
    await celerToken.transfer(dposInstance.address, 10);
    await dposInstance.pause();
    await dposInstance.drainToken(1);
  });

  it('should getDelegatorInfo successfully', async () => {
    await dposInstance.initializeCandidate(
      MIN_SELF_STAKE,
      COMMISSION_RATE,
      RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );
    await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);
    await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
    await dposInstance.intendWithdraw(CANDIDATE, WITHDRAW_STAKE);
    await dposInstance.confirmWithdraw(CANDIDATE);

    await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);
    await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
    await dposInstance.intendWithdraw(CANDIDATE, WITHDRAW_STAKE);

    await dposInstance.getDelegatorInfo.call(CANDIDATE, DELEGATOR);
  });
});
