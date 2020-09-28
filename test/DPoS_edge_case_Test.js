const DPoS = artifacts.require('DPoS');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js')

contract('DPoS edge case', async accounts => {
  const DELEGATOR = accounts[0];
  const CANDIDATE = accounts[1];

  let celerToken;
  let dposInstance;

  beforeEach(async () => {
    celerToken = await CELRToken.new();

    dposInstance = await DPoS.new(
      celerToken.address,
      consts.GOVERN_PROPOSAL_DEPOSIT,
      consts.GOVERN_VOTE_TIMEOUT,
      consts.SLASH_TIMEOUT,
      consts.MIN_VALIDATOR_NUM,
      consts.MAX_VALIDATOR_NUM,
      consts.MIN_STAKING_POOL,
      consts.ADVANCE_NOTICE_PERIOD,
      consts.DPOS_GO_LIVE_TIMEOUT
    );

    // give enough money to other accounts
    for (let i = 1; i < consts.GANACHE_ACCOUNT_NUM; i++) {
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
});
