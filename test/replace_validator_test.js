const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js')

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('validator replacement tests', async accounts => {
  const CANDIDATE = accounts[1];
  const VALIDATORS = [
    accounts[2],
    accounts[3],
    accounts[4],
    accounts[5],
    accounts[6],
    accounts[7],
    accounts[8],
    accounts[9],
    accounts[10],
    accounts[11],
    accounts[12]
  ];

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
        { from: VALIDATORS[i] }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {from: VALIDATORS[i]});

      await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {from: VALIDATORS[i]});
      await dposInstance.delegate(VALIDATORS[i], consts.MIN_STAKING_POOL, {from: VALIDATORS[i]});

      // validators claimValidator
      await dposInstance.claimValidator({from: VALIDATORS[i]});
    }

    const sidechainAddr = sha3(CANDIDATE);
    await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );
    await sgnInstance.updateSidechainAddr(sidechainAddr, {from: CANDIDATE});
  });

  it('should getMinQuorumStakingPool successfully', async () => {
    const number = await dposInstance.getValidatorNum();
    const quorumStakingPool = await dposInstance.getMinQuorumStakingPool();

    assert.equal(number.toNumber(), VALIDATORS.length);
    assert.equal(quorumStakingPool.toString(), '29333333333333333334');
  });

  it('should fail to claimValidator with low stake', async () => {
    await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {from: CANDIDATE});
    await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, {from: CANDIDATE});

    try {
      await dposInstance.claimValidator({from: CANDIDATE});
    } catch (error) {
      assert.isAbove(
        error.message.search('Stake is less than all validators'),
        -1
      );
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should replace a current validator by calling claimValidator with enough stake', async () => {
    await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {from: CANDIDATE});
    await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {from: CANDIDATE});

    const tx = await dposInstance.claimValidator({ from: CANDIDATE });

    assert.equal(tx.logs[0].event, 'ValidatorChange');
    assert.equal(tx.logs[0].args.ethAddr, accounts[2]);
    assert.equal(tx.logs[0].args.changeType, consts.VALIDATOR_REMOVAL);
    assert.equal(tx.logs[1].event, 'ValidatorChange');
    assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
    assert.equal(tx.logs[1].args.changeType, consts.VALIDATOR_ADD);
  });

});
