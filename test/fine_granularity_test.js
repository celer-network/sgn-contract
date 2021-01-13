const fs = require('fs');
const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const utilities = require('./helper/utilities');
const DPoS = artifacts.require('DPoS');
const CELRToken = artifacts.require('CELRToken');
const SGN = artifacts.require('SGN');
const consts = require('./constants.js');

contract('muti-delegator slash tests', async accounts => {
  const GAS_USED_LOG = 'gas_used_logs/fine_granularity/slash.txt';

  const VALIDATORS = [accounts[1], accounts[2], accounts[3], accounts[4]];
  const SELF_STAKE = '6000000000000000000';

  let celerToken;
  let dposInstance;
  let getPenaltyRequestBytes;

  before(async () => {
    fs.writeFileSync(GAS_USED_LOG, '********** Gas Measurement of slash **********\n\n');
    fs.appendFileSync(GAS_USED_LOG, 'delegator number,\tused gas\n');
    const protoChainInstance = await protoChainFactory();
    getPenaltyRequestBytes = protoChainInstance.getPenaltyRequestBytes;
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

    for (let i = 1; i < 6; i++) {
      await celerToken.transfer(accounts[i], consts.TEN_CELR);
      await celerToken.approve(dposInstance.address, consts.TEN_CELR, { from: accounts[i] });
    }

    for (let i = 0; i < VALIDATORS.length; i++) {
      // validators finish initialization
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: VALIDATORS[i] }
      );
      await dposInstance.delegate(VALIDATORS[i], SELF_STAKE, { from: VALIDATORS[i] });

      // validators claimValidator
      await dposInstance.claimValidator({ from: VALIDATORS[i] });
    }

    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
  });

  async function slashMultiDelegators(delegatorSize) {
    it(`measure slash with ${delegatorSize} delegators`, async () => {
      const payload = {
        nonce: delegatorSize,
        expireTime: 1000000,
        validatorAddr: [VALIDATORS[0]],
        delegatorAddrs: [],
        delegatorAmts: [],
        beneficiaryAddrs: [consts.ZERO_ADDR],
        beneficiaryAmts: [],
        signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
      };

      for (let i = 0; i < delegatorSize; i++) {
        payload.delegatorAddrs.push(VALIDATORS[0]);
        payload.delegatorAmts.push(1);
      }

      payload.beneficiaryAmts[0] = delegatorSize;

      const request = await getPenaltyRequestBytes(payload);
      const tx = await dposInstance.slash(request);
      fs.appendFileSync(GAS_USED_LOG, delegatorSize + '\t' + utilities.getCallGasUsed(tx) + '\n');
    });
  }

  for (let i = 1; i < 20; i++) {
    slashMultiDelegators(i * 10);
  }
});

contract('muti-validator reward tests', async accounts => {
  const GAS_USED_LOG = 'gas_used_logs/fine_granularity/reward.txt';

  const VALIDATORS = accounts.slice(1);
  const SELF_STAKE = '6000000000000000000';

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let getRewardRequestBytes;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getRewardRequestBytes = protoChainInstance.getRewardRequestBytes;
    fs.writeFileSync(GAS_USED_LOG, '********** Gas Measurement of reward **********\n\n');
    fs.appendFileSync(GAS_USED_LOG, 'validator number,\tused gas\n');

    celerToken = await CELRToken.new();

    dposInstance = await DPoS.new(
      celerToken.address,
      consts.GOVERN_PROPOSAL_DEPOSIT,
      consts.GOVERN_VOTE_TIMEOUT,
      consts.SLASH_TIMEOUT,
      consts.MIN_VALIDATOR_NUM,
      VALIDATORS.length,
      consts.MIN_STAKING_POOL,
      consts.ADVANCE_NOTICE_PERIOD,
      consts.DPOS_GO_LIVE_TIMEOUT
    );

    sgnInstance = await SGN.new(celerToken.address, dposInstance.address);
    await dposInstance.registerSidechain(sgnInstance.address);

    for (let i = 1; i < accounts.length; i++) {
      await celerToken.transfer(accounts[i], consts.TEN_CELR);
      await celerToken.approve(dposInstance.address, consts.TEN_CELR, { from: accounts[i] });
    }

    for (let i = 0; i < VALIDATORS.length; i++) {
      // validators finish initialization
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: VALIDATORS[i] }
      );
      await dposInstance.delegate(VALIDATORS[i], SELF_STAKE, { from: VALIDATORS[i] });
    }

    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
    await celerToken.approve(dposInstance.address, consts.TEN_CELR);
    await dposInstance.contributeToMiningPool(consts.TEN_CELR);
  });

  async function rewardMultiValidators(validatorSize) {
    it(`measure reward with ${validatorSize} validators`, async () => {
      await dposInstance.claimValidator({ from: VALIDATORS[validatorSize - 1] });
      const payload = {
        receiver: accounts[0],
        cumulativeMiningReward: validatorSize,
        cumulativeServiceReward: 0,
        signers: []
      };

      for (let i = 0; i < validatorSize; i++) {
        payload.signers.push(VALIDATORS[i]);
      }

      const request = await getRewardRequestBytes(payload);
      const tx = await sgnInstance.redeemReward(request);
      fs.appendFileSync(GAS_USED_LOG, validatorSize + '\t' + utilities.getCallGasUsed(tx) + '\n');
    });
  }

  for (let i = 1; i <= VALIDATORS.length; i++) {
    rewardMultiValidators(i);
  }
});
