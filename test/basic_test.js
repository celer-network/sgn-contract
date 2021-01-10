const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const utilities = require('./helper/utilities');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

// basic tests with a single validator candidate and a single delegator
contract('basic tests', async accounts => {
  const GAS_USED_LOG = 'gas_used_logs/basic.txt';

  const CANDIDATE = accounts[1];
  const DELEGATOR = accounts[2];

  let celerToken;
  let dposInstance;
  let sgnInstance;
  let getPenaltyRequestBytes;
  let firstRun = true;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getPenaltyRequestBytes = protoChainInstance.getPenaltyRequestBytes;
    fs.writeFileSync(GAS_USED_LOG, '********** Gas Used in basic Tests **********\n\n');
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
    const tx = await dposInstance.registerSidechain(sgnInstance.address);

    if (firstRun) {
      firstRun = false;
      fs.appendFileSync(GAS_USED_LOG, '***** Deploy Gas Used *****\n');
      let gasUsed = await utilities.getDeployGasUsed(dposInstance);
      fs.appendFileSync(GAS_USED_LOG, 'DPoS Deploy Gas: ' + gasUsed + '\n');
      gasUsed = await utilities.getDeployGasUsed(sgnInstance);
      fs.appendFileSync(GAS_USED_LOG, 'SGN Deploy Gas: ' + gasUsed + '\n');

      fs.appendFileSync(GAS_USED_LOG, '***** Function Calls Gas Used *****\n');
      fs.appendFileSync(
        GAS_USED_LOG,
        'registerSidechain(): ' + utilities.getCallGasUsed(tx) + '\n'
      );
    }
    for (let i = 1; i < 3; i++) {
      await celerToken.transfer(accounts[i], consts.TEN_CELR);
      await celerToken.approve(dposInstance.address, consts.TEN_CELR, { from: accounts[i] });
    }
  });

  it('should fail to delegate to an uninitialized candidate', async () => {
    try {
      await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE);
    } catch (error) {
      assert.isAbove(error.message.search('Candidate is not initialized'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to initialize a candidate when paused', async () => {
    await dposInstance.pause();
    try {
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
    } catch (e) {
      assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to initialize a non-whitelisted candidate when whitelist is enabled', async () => {
    await dposInstance.updateEnableWhitelist(true);
    try {
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
    } catch (e) {
      assert.isAbove(
        e.message.search('WhitelistedRole: caller does not have the Whitelisted role'),
        -1
      );
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should initialize a candidate successfully', async () => {
    let tx = await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );
    assert.equal(tx.logs[0].event, 'InitializeCandidate');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.minSelfStake, consts.MIN_SELF_STAKE);
    assert.equal(tx.logs[0].args.commissionRate, consts.COMMISSION_RATE);
    assert.equal(tx.logs[0].args.rateLockEndTime, consts.RATE_LOCK_END_TIME);
    fs.appendFileSync(
      GAS_USED_LOG,
      'initializeCandidate(): ' + utilities.getCallGasUsed(tx) + '\n'
    );

    const sidechainAddr = sha3(CANDIDATE);
    tx = await sgnInstance.updateSidechainAddr(sidechainAddr, { from: CANDIDATE });
    assert.equal(tx.logs[0].event, 'UpdateSidechainAddr');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.oldSidechainAddr, consts.HASHED_NULL);
    assert.equal(tx.logs[0].args.newSidechainAddr, sha3(sidechainAddr));
    fs.appendFileSync(
      GAS_USED_LOG,
      'updateSidechainAddr(): ' + utilities.getCallGasUsed(tx) + '\n'
    );
  });

  it('should initialize a whitelisted candidate successfully when whitelist is enabled', async () => {
    await dposInstance.updateEnableWhitelist(true);
    await dposInstance.addWhitelisted(CANDIDATE);
    await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );
  });

  describe('after one candidate finishes initialization', async () => {
    const sidechainAddr = sha3(CANDIDATE);

    beforeEach(async () => {
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, { from: CANDIDATE });
    });

    it('should fail to initialize the same candidate twice', async () => {
      try {
        await dposInstance.initializeCandidate(
          consts.MIN_SELF_STAKE,
          consts.COMMISSION_RATE,
          consts.RATE_LOCK_END_TIME,
          { from: CANDIDATE }
        );
      } catch (error) {
        assert.isAbove(error.message.search('Candidate is initialized'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should update sidechain address by candidate successfully', async () => {
      const newSidechainAddr = sha3(CANDIDATE + 'new');
      const tx = await sgnInstance.updateSidechainAddr(newSidechainAddr, { from: CANDIDATE });
      const { event, args } = tx.logs[0];
      assert.equal(event, 'UpdateSidechainAddr');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
      assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
    });

    it('should fail to delegate when paused', async () => {
      await dposInstance.pause();
      try {
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, { from: DELEGATOR });
      } catch (e) {
        assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should delegate to candidate by a delegator successfully', async () => {
      const tx = await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {
        from: DELEGATOR
      });
      const { event, args } = tx.logs[1];

      assert.equal(event, 'Delegate');
      assert.equal(args.delegator, DELEGATOR);
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.newStake, consts.DELEGATOR_STAKE);
      assert.equal(args.stakingPool, consts.DELEGATOR_STAKE);

      fs.appendFileSync(GAS_USED_LOG, 'delegate(): ' + utilities.getCallGasUsed(tx) + '\n');
    });

    it('should fail to claimValidator before delegating enough stake', async () => {
      const stakingPool = (parseInt(consts.MIN_STAKING_POOL) - 10000).toString();
      await dposInstance.delegate(CANDIDATE, stakingPool, { from: DELEGATOR });

      try {
        await dposInstance.claimValidator({ from: CANDIDATE });
      } catch (error) {
        assert.isAbove(error.message.search('Insufficient staking pool'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    describe('after one delegator delegates enough stake to the candidate', async () => {
      beforeEach(async () => {
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, { from: DELEGATOR });
      });

      it('should fail to claimValidator before self delegating minSelfStake', async () => {
        try {
          await dposInstance.claimValidator({ from: CANDIDATE });
        } catch (error) {
          assert.isAbove(error.message.search('Not enough self stake'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should withdrawFromUnbondedCandidate by delegator successfully', async () => {
        const tx = await dposInstance.withdrawFromUnbondedCandidate(
          CANDIDATE,
          consts.DELEGATOR_STAKE,
          { from: DELEGATOR }
        );
        const { event, args } = tx.logs[1];
        assert.equal(event, 'WithdrawFromUnbondedCandidate');
        assert.equal(args.delegator, DELEGATOR);
        assert.equal(args.candidate, CANDIDATE);
        assert.equal(args.amount, consts.DELEGATOR_STAKE);

        fs.appendFileSync(
          GAS_USED_LOG,
          'withdrawFromUnbondedCandidate(): ' + utilities.getCallGasUsed(tx) + '\n'
        );
      });

      it('should fail to withdrawFromUnbondedCandidate more than it delegated', async () => {
        try {
          await dposInstance.withdrawFromUnbondedCandidate(
            CANDIDATE,
            (consts.DELEGATOR_STAKE + 1000).toString(),
            { from: DELEGATOR }
          );
        } catch (error) {
          assert.isAbove(error.message.search('revert'), -1);
          return;
        }
        assert.fail('should have thrown before');
      });

      it('should fail to withdrawFromUnbondedCandidate a smaller amount than 1 ether', async () => {
        try {
          await dposInstance.withdrawFromUnbondedCandidate(CANDIDATE, 1, { from: DELEGATOR });
        } catch (error) {
          assert.isAbove(error.message.search('Amount is smaller than minimum requirement'), -1);
          return;
        }
        assert.fail('should have thrown before');
      });

      describe('after one candidate self delegates minSelfStake', async () => {
        beforeEach(async () => {
          await dposInstance.delegate(CANDIDATE, consts.CANDIDATE_STAKE, { from: CANDIDATE });
        });

        it('should claimValidator successfully', async () => {
          const tx = await dposInstance.claimValidator({ from: CANDIDATE });
          const { event, args } = tx.logs[0];
          assert.equal(event, 'ValidatorChange');
          assert.equal(args.ethAddr, CANDIDATE);
          assert.equal(args.changeType, consts.TYPE_VALIDATOR_ADD);

          fs.appendFileSync(
            GAS_USED_LOG,
            'claimValidator(): ' + utilities.getCallGasUsed(tx) + '\n'
          );
        });

        it('should increase min self stake and claimValidator successfully', async () => {
          const higherMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) + 1000000).toString();
          let tx = await dposInstance.updateMinSelfStake(higherMinSelfStake, { from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
          assert.equal(tx.logs[0].args.candidate, CANDIDATE);
          assert.equal(tx.logs[0].args.minSelfStake, higherMinSelfStake);

          fs.appendFileSync(
            GAS_USED_LOG,
            'updateMinSelfStake(): ' + utilities.getCallGasUsed(tx) + '\n'
          );

          tx = await dposInstance.claimValidator({ from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_ADD);
        });

        it('should decrease min self stake and only able to claimValidator after notice period', async () => {
          const lowerMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) - 1000000).toString();
          let tx = await dposInstance.updateMinSelfStake(lowerMinSelfStake, { from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
          assert.equal(tx.logs[0].args.candidate, CANDIDATE);
          assert.equal(tx.logs[0].args.minSelfStake, lowerMinSelfStake);

          let pass = false;
          try {
            await dposInstance.claimValidator({ from: CANDIDATE });
          } catch (error) {
            assert.isAbove(error.message.search('Not earliest bond time yet'), -1);
            pass = true;
          }
          if (!pass) {
            assert.fail('should have thrown before');
          }

          // wait for advance notice period
          await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);
          tx = await dposInstance.claimValidator({ from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_ADD);
        });

        describe('after one candidate claimValidator', async () => {
          beforeEach(async () => {
            await dposInstance.claimValidator({ from: CANDIDATE });
          });

          it('should fail withdrawFromUnbondedCandidate', async () => {
            try {
              await dposInstance.withdrawFromUnbondedCandidate(CANDIDATE, consts.DELEGATOR_STAKE);
            } catch (error) {
              assert.isAbove(error.message.search('invalid status'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          it('should fail to intendWithdraw a smaller amount than 1 ether', async () => {
            try {
              await dposInstance.intendWithdraw(CANDIDATE, 1);
            } catch (error) {
              assert.isAbove(
                error.message.search('Amount is smaller than minimum requirement'),
                -1
              );
              return;
            }
            assert.fail('should have thrown before');
          });

          it('should fail to intendWithdraw more than it delegated', async () => {
            try {
              await dposInstance.withdrawFromUnbondedCandidate(
                CANDIDATE,
                (consts.DELEGATOR_STAKE + 1000).toString(),
                { from: DELEGATOR }
              );
            } catch (error) {
              assert.isAbove(error.message.search('revert'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          it('should remove the validator after validator intendWithdraw to an amount under minSelfStake', async () => {
            const withdrawalAmt = (
              parseInt(consts.CANDIDATE_STAKE) -
              parseInt(consts.MIN_SELF_STAKE) +
              1000
            ).toString();
            const tx = await dposInstance.intendWithdraw(CANDIDATE, withdrawalAmt, {
              from: CANDIDATE
            });
            const block = await web3.eth.getBlock('latest');

            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
            assert.equal(tx.logs[1].args.changeType, consts.TYPE_VALIDATOR_REMOVAL);

            assert.equal(tx.logs[2].event, 'IntendWithdraw');
            assert.equal(tx.logs[2].args.delegator, CANDIDATE);
            assert.equal(tx.logs[2].args.candidate, CANDIDATE);
            assert.equal(tx.logs[2].args.withdrawAmount, withdrawalAmt);
            assert.equal(tx.logs[2].args.proposedTime.toNumber(), block.number);

            fs.appendFileSync(
              GAS_USED_LOG,
              'intendWithdraw(): ' + utilities.getCallGasUsed(tx) + '\n'
            );
          });

          it('should remove the validator after delegator intendWithdraw to an amount under minStakingPool', async () => {
            const tx = await dposInstance.intendWithdraw(CANDIDATE, consts.DELEGATOR_STAKE, {
              from: DELEGATOR
            });
            const block = await web3.eth.getBlock('latest');

            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
            assert.equal(tx.logs[1].args.changeType, consts.TYPE_VALIDATOR_REMOVAL);

            assert.equal(tx.logs[2].event, 'IntendWithdraw');
            assert.equal(tx.logs[2].args.delegator, DELEGATOR);
            assert.equal(tx.logs[2].args.candidate, CANDIDATE);
            assert.equal(tx.logs[2].args.withdrawAmount, consts.DELEGATOR_STAKE);
            assert.equal(tx.logs[2].args.proposedTime.toNumber(), block.number);
          });

          it('should increase min self stake successfully', async () => {
            const higherMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) + 1000000).toString();
            const tx = await dposInstance.updateMinSelfStake(higherMinSelfStake, {
              from: CANDIDATE
            });
            assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
            assert.equal(tx.logs[0].args.candidate, CANDIDATE);
            assert.equal(tx.logs[0].args.minSelfStake, higherMinSelfStake);
          });

          it('should fail to decrease min self stake', async () => {
            const lowerMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) - 1000000).toString();
            try {
              await dposInstance.updateMinSelfStake(lowerMinSelfStake, { from: CANDIDATE });
            } catch (error) {
              assert.isAbove(error.message.search('Candidate is bonded'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          describe('after a delegator intendWithdraw', async () => {
            beforeEach(async () => {
              await dposInstance.intendWithdraw(CANDIDATE, consts.TWO_CELR, { from: DELEGATOR });
            });

            it('should fail to intendWithdraw with a total more than it delegated', async () => {
              try {
                await dposInstance.withdrawFromUnbondedCandidate(
                  CANDIDATE,
                  consts.DELEGATOR_STAKE,
                  { from: DELEGATOR }
                );
              } catch (error) {
                assert.isAbove(error.message.search('revert'), -1);
                return;
              }
              assert.fail('should have thrown before');
            });

            it('should pass before and after withdrawTimeout', async () => {
              // before withdrawTimeout
              let tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, 0);

              fs.appendFileSync(
                GAS_USED_LOG,
                'confirmWithdraw() before withdrawTimeout: ' + utilities.getCallGasUsed(tx) + '\n'
              );

              // after withdrawTimeout
              await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);

              // first confirmWithdraw
              tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, consts.TWO_CELR);

              fs.appendFileSync(
                GAS_USED_LOG,
                'first confirmWithdraw() after withdrawTimeout: ' +
                  utilities.getCallGasUsed(tx) +
                  '\n'
              );
              // second confirmWithdraw
              tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, 0);

              fs.appendFileSync(
                GAS_USED_LOG,
                'second confirmWithdraw() after withdrawTimeout: ' +
                  utilities.getCallGasUsed(tx) +
                  '\n'
              );
            });

            it('should pass with multiple withdrawal intents', async () => {
              await dposInstance.intendWithdraw(CANDIDATE, consts.ONE_CELR, { from: DELEGATOR });

              let res = await dposInstance.getDelegatorInfo(CANDIDATE, DELEGATOR);
              assert.equal(res.delegatedStake.toString(), consts.THREE_CELR);
              assert.equal(res.undelegatingStake.toString(), consts.THREE_CELR);
              assert.equal(res.intentAmounts[0].toString(), consts.TWO_CELR);
              assert.equal(res.intentAmounts[1].toString(), consts.ONE_CELR);

              await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
              dposInstance.intendWithdraw(CANDIDATE, consts.ONE_CELR, { from: DELEGATOR });

              let tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, consts.THREE_CELR);

              res = await dposInstance.getDelegatorInfo(CANDIDATE, DELEGATOR);
              assert.equal(res.delegatedStake.toString(), consts.TWO_CELR);
              assert.equal(res.undelegatingStake.toString(), consts.ONE_CELR);
              assert.equal(res.intentAmounts.toString(), consts.ONE_CELR);

              tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, 0);

              await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
              tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, consts.ONE_CELR);

              res = await dposInstance.getDelegatorInfo(CANDIDATE, DELEGATOR);
              assert.equal(res.delegatedStake.toString(), consts.TWO_CELR);
              assert.equal(res.undelegatingStake.toNumber(), 0);
            });

            it('should only confirm withdrawal partial amount due to slash', async () => {
              const slashAmt = parseInt(consts.DELEGATOR_STAKE) - parseInt(consts.ONE_CELR);
              await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
              const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [CANDIDATE],
                delegatorAddrs: [DELEGATOR],
                delegatorAmts: [slashAmt],
                beneficiaryAddrs: [consts.ZERO_ADDR],
                beneficiaryAmts: [slashAmt],
                signers: [CANDIDATE]
              });
              await dposInstance.slash(request);

              await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
              const tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, consts.ONE_CELR);
            });

            it('should confirm withdrawal zero amt due to all stakes being slashed', async () => {
              const slashAmt = parseInt(consts.DELEGATOR_STAKE);
              await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
              const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [CANDIDATE],
                delegatorAddrs: [DELEGATOR],
                delegatorAmts: [slashAmt],
                beneficiaryAddrs: [consts.ZERO_ADDR],
                beneficiaryAmts: [slashAmt],
                signers: [CANDIDATE]
              });
              await dposInstance.slash(request);

              await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
              const tx = await dposInstance.confirmWithdraw(CANDIDATE, { from: DELEGATOR });
              assert.equal(tx.logs[0].event, 'ConfirmWithdraw');
              assert.equal(tx.logs[0].args.delegator, DELEGATOR);
              assert.equal(tx.logs[0].args.candidate, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, 0);
            });
          });
        });
      });
    });
  });
});
