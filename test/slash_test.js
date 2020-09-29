const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

contract('single-validator slash tests', async (accounts) => {
  const CANDIDATE = accounts[1];
  const DELEGATOR = accounts[2];
  const RECEIVER = accounts[3];

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let getPenaltyRequestBytes;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getPenaltyRequestBytes = protoChainInstance.getPenaltyRequestBytes;
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
      await celerToken.transfer(accounts[i], '10000000000000000000');
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

  describe('after candidate is bonded and DPoS goes live', async () => {
    beforeEach(async () => {
      await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {from: CANDIDATE});
      await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, {from: CANDIDATE});
      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      await dposInstance.claimValidator({from: CANDIDATE});
      await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
    });

    it('should fail to slash when paused', async () => {
      await dposInstance.pause();

      try {
        const request = await getPenaltyRequestBytes({
          nonce: 1,
          expireTime: 1000000,
          validatorAddr: [CANDIDATE],
          delegatorAddrs: [CANDIDATE, DELEGATOR],
          delegatorAmts: [5, 10],
          beneficiaryAddrs: [consts.ZERO_ADDR, RECEIVER],
          beneficiaryAmts: [7, 8],
          signers: [CANDIDATE]
        });
        await dposInstance.slash(request);
      } catch (e) {
        assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should slash successfully', async () => {
      const oldMiningPool = await dposInstance.miningPool();
      const oldTokenAmt = await celerToken.balanceOf(RECEIVER);

      const request = await getPenaltyRequestBytes({
        nonce: 1,
        expireTime: 1000000,
        validatorAddr: [CANDIDATE],
        delegatorAddrs: [CANDIDATE, DELEGATOR],
        delegatorAmts: [5, 10],
        beneficiaryAddrs: [consts.ZERO_ADDR, RECEIVER],
        beneficiaryAmts: [7, 8],
        signers: [CANDIDATE]
      });
      const tx = await dposInstance.slash(request);
      const newMiningPool = await dposInstance.miningPool();
      const newTokenAmt = await celerToken.balanceOf(RECEIVER);

      assert.equal(tx.logs[0].event, 'Slash');
      assert.equal(tx.logs[0].args.validator, CANDIDATE);
      assert.equal(tx.logs[0].args.delegator, CANDIDATE);
      assert.equal(tx.logs[0].args.amount, 5);

      assert.equal(tx.logs[2].event, 'Slash');
      assert.equal(tx.logs[2].args.validator, CANDIDATE);
      assert.equal(tx.logs[2].args.delegator, DELEGATOR);
      assert.equal(tx.logs[2].args.amount, 10);

      assert.equal(newMiningPool.toString(), oldMiningPool.addn(7).toString());
      assert.equal(newTokenAmt.toString(), oldTokenAmt.addn(8).toString());
    });

    it('should fail to slash with same request twice', async () => {
      const request = await getPenaltyRequestBytes({
        nonce: 1,
        expireTime: 1000000,
        validatorAddr: [CANDIDATE],
        delegatorAddrs: [CANDIDATE, DELEGATOR],
        delegatorAmts: [5, 10],
        beneficiaryAddrs: [consts.ZERO_ADDR, RECEIVER],
        beneficiaryAmts: [7, 8],
        signers: [CANDIDATE]
      });
      await dposInstance.slash(request);

      try {
        await dposInstance.slash(request);
      } catch (error) {
        assert.isAbove(error.message.search('Used penalty nonce'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should fail to slash with expired request', async () => {
      const request = await getPenaltyRequestBytes({
        nonce: 1,
        expireTime: 1,
        validatorAddr: [CANDIDATE],
        delegatorAddrs: [CANDIDATE, DELEGATOR],
        delegatorAmts: [5, 10],
        beneficiaryAddrs: [consts.ZERO_ADDR, RECEIVER],
        beneficiaryAmts: [7, 8],
        signers: [CANDIDATE]
      });

      try {
        await dposInstance.slash(request);
      } catch (error) {
        assert.isAbove(error.message.search('Penalty expired'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it("should fail to slash if amount sums don't match", async () => {
      const request = await getPenaltyRequestBytes({
        nonce: 1,
        expireTime: 1000000,
        validatorAddr: [CANDIDATE],
        delegatorAddrs: [CANDIDATE, DELEGATOR],
        delegatorAmts: [5, 10],
        beneficiaryAddrs: [consts.ZERO_ADDR, RECEIVER],
        beneficiaryAmts: [10, 10],
        signers: [CANDIDATE]
      });

      try {
        await dposInstance.slash(request);
      } catch (error) {
        assert.isAbove(error.message.search('Amount not match'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });
  });
});

contract('muti-validator slash tests', async (accounts) => {
  const VALIDATORS = [accounts[1], accounts[2], accounts[3], accounts[4]];
  const NON_VALIDATOR = accounts[5];
  const SELF_STAKE = '6000000000000000000';

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let getPenaltyRequestBytes;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getPenaltyRequestBytes = protoChainInstance.getPenaltyRequestBytes;
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

    for (let i = 1; i < consts.GANACHE_ACCOUNT_NUM; i++) {
      await celerToken.transfer(accounts[i], '10000000000000000000');
    }

    for (let i = 0; i < VALIDATORS.length; i++) {
      // validators finish initialization
      const sidechainAddr = sha3(VALIDATORS[i]);
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        {from: VALIDATORS[i]}
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {from: VALIDATORS[i]});

      await celerToken.approve(dposInstance.address, SELF_STAKE, {from: VALIDATORS[i]});
      await dposInstance.delegate(VALIDATORS[i], SELF_STAKE, {from: VALIDATORS[i]});

      // validators claimValidator
      await dposInstance.claimValidator({from: VALIDATORS[i]});
    }

    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
  });

  it('should call slash successfully with sufficient delegation', async () => {
    const request = await getPenaltyRequestBytes({
      nonce: 1,
      expireTime: 1000000,
      validatorAddr: [VALIDATORS[0]],
      delegatorAddrs: [VALIDATORS[0]],
      delegatorAmts: [10],
      beneficiaryAddrs: [consts.ZERO_ADDR],
      beneficiaryAmts: [10],
      signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
    });

    const tx = await dposInstance.slash(request);

    assert.equal(tx.logs[0].event, 'Slash');
    assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.amount, 10);
  });

  it('should fail to call slash with duplicate signatures and insufficient delegation', async () => {
    const request = await getPenaltyRequestBytes({
      nonce: 1,
      expireTime: 1000000,
      validatorAddr: [VALIDATORS[0]],
      delegatorAddrs: [VALIDATORS[0]],
      delegatorAmts: [10],
      beneficiaryAddrs: [consts.ZERO_ADDR],
      beneficiaryAmts: [10],
      signers: [VALIDATORS[1], VALIDATORS[1], VALIDATORS[1], VALIDATORS[1]]
    });

    try {
      await dposInstance.slash(request);
    } catch (error) {
      assert.isAbove(error.message.search('Fail to check validator sigs'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should call slash twice successfully with the same group of signers', async () => {
    let request = await getPenaltyRequestBytes({
      nonce: 1,
      expireTime: 1000000,
      validatorAddr: [VALIDATORS[0]],
      delegatorAddrs: [VALIDATORS[0]],
      delegatorAmts: [10],
      beneficiaryAddrs: [consts.ZERO_ADDR],
      beneficiaryAmts: [10],
      signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
    });

    let tx = await dposInstance.slash(request);

    assert.equal(tx.logs[0].event, 'Slash');
    assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.amount, 10);

    request = await getPenaltyRequestBytes({
      nonce: 2,
      expireTime: 1000000,
      validatorAddr: [VALIDATORS[0]],
      delegatorAddrs: [VALIDATORS[0]],
      delegatorAmts: [10],
      beneficiaryAddrs: [consts.ZERO_ADDR],
      beneficiaryAmts: [10],
      signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
    });

    tx = await dposInstance.slash(request);

    assert.equal(tx.logs[0].event, 'Slash');
    assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.amount, 10);
  });
});