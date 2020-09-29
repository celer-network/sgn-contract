const DPoS = artifacts.require('DPoS');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js')

contract('drain token test', async accounts => {
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
  });

  it('should fail to drain token when not paused', async () => {
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

  it('should drainToken successfully when paused', async () => {
    await celerToken.transfer(dposInstance.address, 10);
    await dposInstance.pause();
    await dposInstance.drainToken(1);
  });

});
