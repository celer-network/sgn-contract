const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

contract('subscribe tests', async (accounts) => {
  const CANDIDATE = accounts[1];
  const SUBSCRIBER = accounts[3];

  let celerToken;
  let dposInstance;
  let sgnInstance;

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

    sgnInstance = await SGN.new(celerToken.address, dposInstance.address);

    await dposInstance.registerSidechain(sgnInstance.address);

    for (let i = 1; i < 5; i++) {
      await celerToken.transfer(accounts[i], consts.TEN_CELR);
      await celerToken.approve(dposInstance.address, consts.TEN_CELR, {from: accounts[i]});
      await celerToken.approve(sgnInstance.address, consts.TEN_CELR, {from: accounts[i]});
    }

    await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      {from: CANDIDATE}
    );
    const sidechainAddr = sha3(CANDIDATE);
    await sgnInstance.updateSidechainAddr(sidechainAddr, {from: CANDIDATE});
  });

  it('should fail to subscribe before sidechain goes live', async () => {
    try {
      await sgnInstance.subscribe(consts.SUB_FEE, {from: SUBSCRIBER});
    } catch (error) {
      assert.isAbove(error.message.search('DPoS is not valid'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to subscribe before there are enough validators', async () => {
    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);

    try {
      await sgnInstance.subscribe(consts.SUB_FEE, {from: SUBSCRIBER});
    } catch (error) {
      assert.isAbove(error.message.search('DPoS is not valid'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  describe('after candidate is bonded and DPoS goes live', async () => {
    beforeEach(async () => {
      await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, {from: CANDIDATE});
      await dposInstance.claimValidator({from: CANDIDATE});
      await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
    });

    it('should fail to subscribe when paused', async () => {
      await sgnInstance.pause();
      try {
        await sgnInstance.subscribe(consts.SUB_FEE, {from: SUBSCRIBER});
      } catch (e) {
        assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should subscribe successfully when there are enough validators', async () => {
      const tx = await sgnInstance.subscribe(consts.SUB_FEE, {from: SUBSCRIBER});
      const {event, args} = tx.logs[0];

      assert.equal(event, 'AddSubscriptionBalance');
      assert.equal(args.consumer, SUBSCRIBER);
      assert.equal(args.amount, consts.SUB_FEE);
    });
  });
});
