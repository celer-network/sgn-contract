const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

contract('reward tests', async (accounts) => {
  const CANDIDATE = accounts[1];
  const SUBSCRIBER = accounts[3];
  const RECEIVER = accounts[4];
  const LARGER_LOCK_END_TIME = 100000;

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let getRewardRequestBytes;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getRewardRequestBytes = protoChainInstance.getRewardRequestBytes;
  });

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

  it('should fail to contribute to mining pool when paused', async () => {
    await dposInstance.pause();
    await celerToken.approve(dposInstance.address, 100);

    try {
      await dposInstance.contributeToMiningPool(100);
    } catch (e) {
      assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should contribute to mining pool successfully', async () => {
    const contribution = 100;
    await celerToken.approve(dposInstance.address, contribution);
    const tx = await dposInstance.contributeToMiningPool(contribution);
    const {event, args} = tx.logs[0];

    assert.equal(event, 'MiningPoolContribution');
    assert.equal(args.contributor, accounts[0]);
    assert.equal(args.contribution, contribution);
    // previous miningPoolSize is 0
    assert.equal(args.miningPoolSize, contribution);
  });

  it('should increase the commission rate lock end time successfully', async () => {
    const tx = await dposInstance.nonIncreaseCommissionRate(
      consts.COMMISSION_RATE,
      LARGER_LOCK_END_TIME,
      {from: CANDIDATE}
    );
    const {event, args} = tx.logs[0];

    assert.equal(event, 'UpdateCommissionRate');
    assert.equal(args.candidate, CANDIDATE);
    assert.equal(args.newRate, consts.COMMISSION_RATE);
    assert.equal(args.newLockEndTime, LARGER_LOCK_END_TIME);
  });

  it('should fail to update the commission rate lock end time to an outdated block number', async () => {
    try {
      await dposInstance.nonIncreaseCommissionRate(consts.COMMISSION_RATE, 1, {
        from: CANDIDATE
      });
    } catch (error) {
      assert.isAbove(error.message.search('Outdated new lock end time'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to decrease the commission rate lock end time', async () => {
    // increase the lock end time first
    await dposInstance.nonIncreaseCommissionRate(consts.COMMISSION_RATE, LARGER_LOCK_END_TIME, {
      from: CANDIDATE
    });

    // get next block
    const block = await web3.eth.getBlock('latest');

    try {
      await dposInstance.nonIncreaseCommissionRate(consts.COMMISSION_RATE, block.number + 10, {
        from: CANDIDATE
      });
    } catch (error) {
      assert.isAbove(error.message.search('Invalid new lock end time'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should decrease the commission rate at anytime', async () => {
    let lowerRate = consts.COMMISSION_RATE - 10;
    let tx = await dposInstance.nonIncreaseCommissionRate(lowerRate, LARGER_LOCK_END_TIME, {
      from: CANDIDATE
    });

    assert.equal(tx.logs[0].event, 'UpdateCommissionRate');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.newRate, lowerRate);
    assert.equal(tx.logs[0].args.newLockEndTime, LARGER_LOCK_END_TIME);

    lowerRate = consts.COMMISSION_RATE - 20;
    tx = await dposInstance.nonIncreaseCommissionRate(lowerRate, LARGER_LOCK_END_TIME, {
      from: CANDIDATE
    });

    assert.equal(tx.logs[0].event, 'UpdateCommissionRate');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.newRate, lowerRate);
    assert.equal(tx.logs[0].args.newLockEndTime, LARGER_LOCK_END_TIME);
  });

  it('should announce increase commission rate successfully', async () => {
    const higherRate = consts.COMMISSION_RATE + 10;
    const tx = await dposInstance.announceIncreaseCommissionRate(higherRate, LARGER_LOCK_END_TIME, {
      from: CANDIDATE
    });
    const {event, args} = tx.logs[0];

    assert.equal(event, 'CommissionRateAnnouncement');
    assert.equal(args.candidate, CANDIDATE);
    assert.equal(args.announcedRate, higherRate);
    assert.equal(args.announcedLockEndTime, LARGER_LOCK_END_TIME);
  });

  describe('after announceIncreaseCommissionRate', async () => {
    const higherRate = consts.COMMISSION_RATE + 10;

    beforeEach(async () => {
      await dposInstance.announceIncreaseCommissionRate(higherRate, LARGER_LOCK_END_TIME, {
        from: CANDIDATE
      });
    });

    it('should fail to confirmIncreaseCommissionRate before new rate can take effect', async () => {
      try {
        await dposInstance.confirmIncreaseCommissionRate({from: CANDIDATE});
      } catch (error) {
        assert.isAbove(error.message.search('Still in notice period'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should fail to confirmIncreaseCommissionRate after new rate can take effect but before lock end time', async () => {
      await dposInstance.nonIncreaseCommissionRate(consts.COMMISSION_RATE, LARGER_LOCK_END_TIME, {
        from: CANDIDATE
      });

      // need to announceIncreaseCommissionRate again because _updateCommissionRate
      // will remove the previous announcement of increasing commission rate
      await dposInstance.announceIncreaseCommissionRate(higherRate, LARGER_LOCK_END_TIME, {
        from: CANDIDATE
      });

      await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);

      try {
        await dposInstance.confirmIncreaseCommissionRate({from: CANDIDATE});
      } catch (error) {
        assert.isAbove(error.message.search('Commission rate is locked'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should confirmIncreaseCommissionRate successfully after new rate takes effect ', async () => {
      await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);
      const tx = await dposInstance.confirmIncreaseCommissionRate({from: CANDIDATE});
      const {event, args} = tx.logs[0];

      assert.equal(event, 'UpdateCommissionRate');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.newRate, higherRate);
      assert.equal(args.newLockEndTime, LARGER_LOCK_END_TIME);
    });
  });

  describe('after candidate is bonded and DPoS goes live', async () => {
    beforeEach(async () => {
      await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {from: CANDIDATE});
      await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, {from: CANDIDATE});
      await dposInstance.claimValidator({from: CANDIDATE});
      await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);

      // submit subscription fees
      await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {from: SUBSCRIBER});
      await sgnInstance.subscribe(consts.SUB_FEE, {from: SUBSCRIBER});
    });

    it('should fail to redeem reward when paused', async () => {
      await sgnInstance.pause();

      try {
        const rewardRequest = await getRewardRequestBytes({
          receiver: RECEIVER,
          cumulativeMiningReward: 100,
          cumulativeServiceReward: 0,
          signers: [CANDIDATE]
        });
        await sgnInstance.redeemReward(rewardRequest);
      } catch (e) {
        assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should redeem reward successfully', async () => {
      // contribute to mining pool
      const contribution = 100;
      await celerToken.approve(dposInstance.address, contribution);
      await dposInstance.contributeToMiningPool(contribution);

      const receiver = RECEIVER;
      const miningReward = 40;
      const serviceReward = 60;
      const rewardRequest = await getRewardRequestBytes({
        receiver: receiver,
        cumulativeMiningReward: miningReward,
        cumulativeServiceReward: serviceReward,
        signers: [CANDIDATE]
      });
      const tx = await sgnInstance.redeemReward(rewardRequest);

      assert.equal(tx.logs[0].event, 'RedeemReward');
      assert.equal(tx.logs[0].args.receiver, receiver);
      assert.equal(tx.logs[0].args.cumulativeMiningReward, miningReward);
      assert.equal(tx.logs[0].args.serviceReward, serviceReward);
      assert.equal(tx.logs[0].args.servicePool, consts.SUB_FEE - serviceReward);

      // TODO: add checks for RedeemMiningReward event (hash is the only way to validate it)
    });

    it('should fail to redeem reward more than amount in mining pool', async () => {
      // contribute to mining pool
      const contribution = 100;
      await celerToken.approve(dposInstance.address, contribution);
      await dposInstance.contributeToMiningPool(contribution);

      const rewardRequest = await getRewardRequestBytes({
        receiver: RECEIVER,
        cumulativeMiningReward: contribution + 1,
        cumulativeServiceReward: 0,
        signers: [CANDIDATE]
      });

      try {
        await sgnInstance.redeemReward(rewardRequest);
      } catch (error) {
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should fail to redeem reward more than amount in service pool', async () => {
      const rewardRequest = await getRewardRequestBytes({
        receiver: RECEIVER,
        cumulativeMiningReward: 0,
        cumulativeServiceReward: consts.SUB_FEE + 1,
        signers: [CANDIDATE]
      });

      try {
        await sgnInstance.redeemReward(rewardRequest);
      } catch (error) {
        return;
      }

      assert.fail('should have thrown before');
    });
  });
});
