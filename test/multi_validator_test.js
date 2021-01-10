const fs = require('fs');
const Timetravel = require('./helper/timetravel');
const utilities = require('./helper/utilities');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

contract('multiple validators tests', async accounts => {
  const GAS_USED_LOG = 'gas_used_logs/multiple_validators.txt';

  const VALIDATORS = [
    accounts[1],
    accounts[2],
    accounts[3],
    accounts[4],
    accounts[5],
    accounts[6],
    accounts[7]
  ]; // consts.MAX_VALIDATOR_NUM = 7
  const CANDIDATE = accounts[8];
  const DELEGATOR = accounts[15];

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let firstRun = true;

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

    for (let i = 1; i < 9; i++) {
      await celerToken.transfer(accounts[i], consts.TEN_CELR);
      await celerToken.approve(dposInstance.address, consts.TEN_CELR, { from: accounts[i] });
    }
    const delegatorbalance = '100000000000000000000'; // 100 CELR
    await celerToken.transfer(DELEGATOR, delegatorbalance);
    await celerToken.approve(dposInstance.address, delegatorbalance, { from: DELEGATOR });

    if (firstRun) {
      fs.writeFileSync(GAS_USED_LOG, '********** Gas Used in multi validator Tests **********\n\n');
      fs.appendFileSync(GAS_USED_LOG, '***** Function Calls Gas Used *****\n');
    }

    for (let i = 0; i < VALIDATORS.length; i++) {
      // validators finish initialization
      let tx = await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: VALIDATORS[i] }
      );

      if (firstRun) {
        fs.appendFileSync(
          GAS_USED_LOG,
          `initializeCandidate() validator ${i}: ` + utilities.getCallGasUsed(tx) + '\n'
        );
      }

      tx = await dposInstance.delegate(VALIDATORS[i], consts.CANDIDATE_STAKE, {
        from: VALIDATORS[i]
      });
      if (firstRun) {
        fs.appendFileSync(
          GAS_USED_LOG,
          `delegate() validator ${i}: ` + utilities.getCallGasUsed(tx) + '\n'
        );
      }
      await dposInstance.delegate(VALIDATORS[i], consts.DELEGATOR_STAKE, { from: DELEGATOR });

      // validators claimValidator
      tx = await dposInstance.claimValidator({ from: VALIDATORS[i] });
      if (firstRun) {
        fs.appendFileSync(
          GAS_USED_LOG,
          `claimValidator() validator ${i}: ` + utilities.getCallGasUsed(tx) + '\n'
        );
      }
    }

    await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );

    firstRun = false;
  });

  it('should getMinQuorumStakingPool successfully', async () => {
    const number = await dposInstance.getValidatorNum();
    const quorumStakingPool = await dposInstance.getMinQuorumStakingPool();

    assert.equal(number.toNumber(), VALIDATORS.length);
    assert.equal(quorumStakingPool.toString(), '42000000000000000001');
  });

  it('should fail to claimValidator with low stake', async () => {
    await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, { from: CANDIDATE });

    try {
      await dposInstance.claimValidator({ from: CANDIDATE });
    } catch (error) {
      assert.isAbove(error.message.search('Not larger than smallest pool'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should replace a current validator by calling claimValidator with enough stake', async () => {
    await dposInstance.delegate(CANDIDATE, consts.TEN_CELR, { from: CANDIDATE });

    const tx = await dposInstance.claimValidator({ from: CANDIDATE });

    assert.equal(tx.logs[0].event, 'ValidatorChange');
    assert.equal(tx.logs[0].args.ethAddr, VALIDATORS[0]);
    assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_REMOVAL);
    assert.equal(tx.logs[1].event, 'ValidatorChange');
    assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
    assert.equal(tx.logs[1].args.changeType, consts.TYPE_VALIDATOR_ADD);
  });

  describe('after one delegator is replaced by the new candidate', async () => {
    beforeEach(async () => {
      await dposInstance.delegate(CANDIDATE, consts.TEN_CELR, { from: CANDIDATE });
      await dposInstance.claimValidator({ from: CANDIDATE });
    });

    it('should confirmUnbondedCandidate after unbondTime', async () => {
      const res = await dposInstance.getCandidateInfo(VALIDATORS[0]);
      assert.equal(res.status.toNumber(), consts.STATUS_UNBONDING);

      let pass = false;
      try {
        await dposInstance.confirmUnbondedCandidate(VALIDATORS[0]);
      } catch (e) {
        assert.isAbove(e.message.search('revert'), -1);
        pass = true;
      }
      if (!pass) {
        assert.fail('should have thrown before');
      }

      await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
      const tx = await dposInstance.confirmUnbondedCandidate(VALIDATORS[0]);

      const { event, args } = tx.logs[0];
      assert.equal(event, 'CandidateUnbonded');
      assert.equal(args.candidate, VALIDATORS[0]);

      fs.appendFileSync(
        GAS_USED_LOG,
        'confirmUnbondedCandidate(): ' + utilities.getCallGasUsed(tx) + '\n'
      );
    });

    it('should replace validator that has min stakes with the unbonding validator', async () => {
      await dposInstance.intendWithdraw(VALIDATORS[3], consts.ONE_CELR, { from: DELEGATOR });

      const tx = await dposInstance.claimValidator({ from: VALIDATORS[0] });
      assert.equal(tx.logs[0].event, 'ValidatorChange');
      assert.equal(tx.logs[0].args.ethAddr, VALIDATORS[3]);
      assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_REMOVAL);
      assert.equal(tx.logs[1].event, 'ValidatorChange');
      assert.equal(tx.logs[1].args.ethAddr, VALIDATORS[0]);
      assert.equal(tx.logs[1].args.changeType, consts.TYPE_VALIDATOR_ADD);
    });
  });
});
