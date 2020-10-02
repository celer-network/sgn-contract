const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');
const consts = require('./constants.js');

// basic tests with a single valdiator candidate and a single delegator
contract('basic tests', async (accounts) => {
  const CANDIDATE = accounts[1];
  const DELEGATOR = accounts[2];

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

    for (let i = 1; i < 3; i++) {
      await celerToken.transfer(accounts[i], '10000000000000000000');
    }
  });

  it('should fail to delegate to an uninitialized candidate', async () => {
    await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE);

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
        {from: CANDIDATE}
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
        {from: CANDIDATE}
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
      {from: CANDIDATE}
    );
    assert.equal(tx.logs[0].event, 'InitializeCandidate');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.minSelfStake, consts.MIN_SELF_STAKE);
    assert.equal(tx.logs[0].args.commissionRate, consts.COMMISSION_RATE);
    assert.equal(tx.logs[0].args.rateLockEndTime, consts.RATE_LOCK_END_TIME);

    const sidechainAddr = sha3(CANDIDATE);
    tx = await sgnInstance.updateSidechainAddr(sidechainAddr, {from: CANDIDATE});
    assert.equal(tx.logs[0].event, 'UpdateSidechainAddr');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.oldSidechainAddr, consts.HASHED_NULL);
    assert.equal(tx.logs[0].args.newSidechainAddr, sha3(sidechainAddr));
  });

  it('should initialize a whitelisted candidate successfully when whitelist is enabled', async () => {
    await dposInstance.updateEnableWhitelist(true);
    await dposInstance.addWhitelisted(CANDIDATE);
    await dposInstance.initializeCandidate(
      consts.MIN_SELF_STAKE,
      consts.COMMISSION_RATE,
      consts.RATE_LOCK_END_TIME,
      {from: CANDIDATE}
    );
  });

  describe('after one candidate finishes initialization', async () => {
    const sidechainAddr = sha3(CANDIDATE);

    beforeEach(async () => {
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        {from: CANDIDATE}
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {from: CANDIDATE});
    });

    it('should fail to initialize the same candidate twice', async () => {
      try {
        await dposInstance.initializeCandidate(
          consts.MIN_SELF_STAKE,
          consts.COMMISSION_RATE,
          consts.RATE_LOCK_END_TIME,
          {from: CANDIDATE}
        );
      } catch (error) {
        assert.isAbove(error.message.search('Candidate is initialized'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should update sidechain address by candidate successfully', async () => {
      const newSidechainAddr = sha3(CANDIDATE + 'new');
      const tx = await sgnInstance.updateSidechainAddr(newSidechainAddr, {from: CANDIDATE});
      const {event, args} = tx.logs[0];
      assert.equal(event, 'UpdateSidechainAddr');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
      assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
    });

    it('should fail to delegate when paused', async () => {
      await dposInstance.pause();

      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      try {
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      } catch (e) {
        assert.isAbove(e.message.search('VM Exception while processing transaction'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should delegate to candidate by a delegator successfully', async () => {
      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {from: DELEGATOR});

      const tx = await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      const {event, args} = tx.logs[1];

      assert.equal(event, 'Delegate');
      assert.equal(args.delegator, DELEGATOR);
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.newStake, consts.DELEGATOR_STAKE);
      assert.equal(args.stakingPool, consts.DELEGATOR_STAKE);
    });

    it('should fail to claimValidator before delegating enough stake', async () => {
      const stakingPool = (parseInt(consts.MIN_STAKING_POOL) - 10000).toString();
      await celerToken.approve(dposInstance.address, stakingPool, {from: DELEGATOR});
      await dposInstance.delegate(CANDIDATE, stakingPool, {from: DELEGATOR});

      try {
        await dposInstance.claimValidator({from: CANDIDATE});
      } catch (error) {
        assert.isAbove(error.message.search('Insufficient staking pool'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    describe('after one delegator delegates enough stake to the candidate', async () => {
      beforeEach(async () => {
        await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {from: DELEGATOR});
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {from: DELEGATOR});
      });

      it('should fail to claimValidator before self delegating minSelfStake', async () => {
        try {
          await dposInstance.claimValidator({from: CANDIDATE});
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
          {from: DELEGATOR}
        );
        const {event, args} = tx.logs[1];
        assert.equal(event, 'WithdrawFromUnbondedCandidate');
        assert.equal(args.delegator, DELEGATOR);
        assert.equal(args.candidate, CANDIDATE);
        assert.equal(args.amount, consts.DELEGATOR_STAKE);
      });

      describe('after one candidate self delegates minSelfStake', async () => {
        beforeEach(async () => {
          await celerToken.approve(dposInstance.address, consts.CANDIDATE_STAKE, {from: CANDIDATE});
          await dposInstance.delegate(CANDIDATE, consts.CANDIDATE_STAKE, {from: CANDIDATE});
        });

        it('should claimValidator successfully', async () => {
          const tx = await dposInstance.claimValidator({from: CANDIDATE});
          const {event, args} = tx.logs[0];
          assert.equal(event, 'ValidatorChange');
          assert.equal(args.ethAddr, CANDIDATE);
          assert.equal(args.changeType, consts.TYPE_VALIDATOR_ADD);
        });

        it('should increase min self stake and claimValidator successfully', async () => {
          const higherMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) + 1000000).toString();
          let tx = await dposInstance.updateMinSelfStake(higherMinSelfStake, {from: CANDIDATE});
          assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
          assert.equal(tx.logs[0].args.candidate, CANDIDATE);
          assert.equal(tx.logs[0].args.minSelfStake, higherMinSelfStake);

          tx = await dposInstance.claimValidator({from: CANDIDATE});
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_ADD);
        });

        it('should decrease min self stake and only able to claimValidator after notice period', async () => {
          const lowerMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) - 1000000).toString();
          let tx = await dposInstance.updateMinSelfStake(lowerMinSelfStake, {from: CANDIDATE});
          assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
          assert.equal(tx.logs[0].args.candidate, CANDIDATE);
          assert.equal(tx.logs[0].args.minSelfStake, lowerMinSelfStake);

          let pass = false;
          try {
            await dposInstance.claimValidator({from: CANDIDATE});
          } catch (error) {
            assert.isAbove(error.message.search('Not earliest bond time yet'), -1);
            pass = true;
          }
          if (!pass) {
            assert.fail('should have thrown before');
          }

          // wait for advance notice period
          await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);
          tx = await dposInstance.claimValidator({from: CANDIDATE});
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.TYPE_VALIDATOR_ADD);
        });

        describe('after one candidate claimValidator', async () => {
          beforeEach(async () => {
            await dposInstance.claimValidator({from: CANDIDATE});
          });

          it('should fail withdrawFromUnbondedCandidate', async () => {
            try {
              await dposInstance.withdrawFromUnbondedCandidate(
                CANDIDATE,
                consts.DELEGATOR_STAKE
              );
            } catch (error) {
              assert.isAbove(error.message.search('invalid status'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          it('should fail to withdrawFromUnbondedCandidate a smaller amount than 1 ether', async () => {
            try {
              await dposInstance.withdrawFromUnbondedCandidate(CANDIDATE, 1);
            } catch (error) {
              assert.isAbove(
                error.message.search('Amount is smaller than minimum requirement'),
                -1
              );
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

          it('should remove the validator after validator intendWithdraw to an amount under minSelfStake', async () => {
            const withdrawalAmt = (
              parseInt(consts.CANDIDATE_STAKE) -
              parseInt(consts.MIN_SELF_STAKE) +
              100
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
            const tx = await dposInstance.updateMinSelfStake(higherMinSelfStake, {from: CANDIDATE});
            assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
            assert.equal(tx.logs[0].args.candidate, CANDIDATE);
            assert.equal(tx.logs[0].args.minSelfStake, higherMinSelfStake);
          });

          it('should fail to decrease min self stake', async () => {
            const lowerMinSelfStake = (parseInt(consts.MIN_SELF_STAKE) - 1000000).toString();
            try {
              await dposInstance.updateMinSelfStake(lowerMinSelfStake, {from: CANDIDATE});
            } catch (error) {
              assert.isAbove(error.message.search('Candidate is bonded'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          // TODO: add a test of "fail to confirmWithdraw because penalty slashes all undelegating stake"

          describe('after a delegator intendWithdraw', async () => {
            beforeEach(async () => {
              await dposInstance.intendWithdraw(CANDIDATE, consts.DELEGATOR_STAKE, {
                from: DELEGATOR
              });
            });

            it('should confirmWithdraw 0 before withdrawTimeout', async () => {
              const tx = await dposInstance.confirmWithdraw(CANDIDATE, {from: DELEGATOR});
              const {event, args} = tx.logs[0];
              assert.equal(event, 'ConfirmWithdraw');
              assert.equal(args.delegator, DELEGATOR);
              assert.equal(args.candidate, CANDIDATE);
              assert.equal(args.amount, 0);
            });

            describe('after withdrawTimeout', async () => {
              beforeEach(async () => {
                await Timetravel.advanceBlocks(consts.SLASH_TIMEOUT);
              });

              it('should confirmWithdraw successfully', async () => {
                const tx = await dposInstance.confirmWithdraw(CANDIDATE, {from: DELEGATOR});
                const {event, args} = tx.logs[0];
                assert.equal(event, 'ConfirmWithdraw');
                assert.equal(args.delegator, DELEGATOR);
                assert.equal(args.candidate, CANDIDATE);
                assert.equal(args.amount, consts.DELEGATOR_STAKE);
              });

              describe('after confirmWithdraw', async () => {
                beforeEach(async () => {
                  await dposInstance.confirmWithdraw(CANDIDATE, {from: DELEGATOR});
                });

                it('should confirmWithdraw 0 after all withdraw intents are cleared', async () => {
                  const tx = await dposInstance.confirmWithdraw(CANDIDATE, {from: DELEGATOR});
                  const {event, args} = tx.logs[0];
                  assert.equal(event, 'ConfirmWithdraw');
                  assert.equal(args.delegator, DELEGATOR);
                  assert.equal(args.candidate, CANDIDATE);
                  assert.equal(args.amount, 0);
                });
              });
            });
          });
        });
      });
    });
  });
});
