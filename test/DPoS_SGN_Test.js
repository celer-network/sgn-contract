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
contract('DPoS and SGN contracts', async accounts => {
  const DELEGATOR = accounts[0];
  const CANDIDATE = accounts[1];
  const SUBSCRIBER = accounts[2];

  let celerToken;
  // let instance;
  let dposInstance;
  let sgnInstance;
  let getRewardRequestBytes;
  let getPenaltyRequestBytes;

  before(async () => {
    const protoChainInstance = await protoChainFactory();
    getRewardRequestBytes = protoChainInstance.getRewardRequestBytes;
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

    // give enough money to other accounts
    for (let i = 1; i < consts.GANACHE_ACCOUNT_NUM; i++) {
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

  it('should fail to subscribe before sidechain goes live', async () => {
    await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
      from: SUBSCRIBER
    });

    try {
      await sgnInstance.subscribe(consts.SUB_FEE, {
        from: SUBSCRIBER
      });
    } catch (error) {
      assert.isAbove(error.message.search('DPoS is not valid'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to subscribe before there are enough validators', async () => {
    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
    await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
      from: SUBSCRIBER
    });

    try {
      await sgnInstance.subscribe(consts.SUB_FEE, {
        from: SUBSCRIBER
      });
    } catch (error) {
      assert.isAbove(error.message.search('DPoS is not valid'), -1);
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to initialize a candidate for unpaused state', async () => {
    await dposInstance.pause();
    try {
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
    } catch (e) {
      assert.isAbove(
        e.message.search('VM Exception while processing transaction'),
        -1
      );
      return;
    }

    assert.fail('should have thrown before');
  });

  it('should fail to initialize a candidate when whitelist is on and missing from whitelist', async () => {
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
        e.message.search(
          'WhitelistedRole: caller does not have the Whitelisted role'
        ),
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

    const sidechainAddr = sha3(CANDIDATE);
    tx = await sgnInstance.updateSidechainAddr(sidechainAddr, {
      from: CANDIDATE
    });
    assert.equal(tx.logs[0].event, 'UpdateSidechainAddr');
    assert.equal(tx.logs[0].args.candidate, CANDIDATE);
    assert.equal(tx.logs[0].args.oldSidechainAddr, consts.HASHED_NULL);
    assert.equal(tx.logs[0].args.newSidechainAddr, sha3(sidechainAddr));
  });

  it('should initialize a candidate successfully when whitelist is on and in whitelist', async () => {
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
      await sgnInstance.updateSidechainAddr(sidechainAddr, {
        from: CANDIDATE
      });
    });

    it('should increase the rate lock end time successfully', async () => {
      const tx = await dposInstance.nonIncreaseCommissionRate(
        consts.COMMISSION_RATE,
        consts.LARGER_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      const { event, args } = tx.logs[0];

      assert.equal(event, 'UpdateCommissionRate');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.newRate, consts.COMMISSION_RATE);
      assert.equal(args.newLockEndTime, consts.LARGER_LOCK_END_TIME);
    });

    it('should fail to update the rate lock end time to an outdated block number', async () => {
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

    it('should fail to decrease the rate lock end time', async () => {
      // increase the lock end time first
      await dposInstance.nonIncreaseCommissionRate(
        consts.COMMISSION_RATE,
        consts.LARGER_LOCK_END_TIME,
        { from: CANDIDATE }
      );

      // get next block
      const block = await web3.eth.getBlock('latest');

      try {
        await dposInstance.nonIncreaseCommissionRate(
          consts.COMMISSION_RATE,
          block.number + 10,
          { from: CANDIDATE }
        );
      } catch (error) {
        assert.isAbove(error.message.search('Invalid new lock end time'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should decrease the commission rate anytime', async () => {
      let tx = await dposInstance.nonIncreaseCommissionRate(
        consts.LOWER_RATE,
        consts.LARGER_LOCK_END_TIME,
        { from: CANDIDATE }
      );

      assert.equal(tx.logs[0].event, 'UpdateCommissionRate');
      assert.equal(tx.logs[0].args.candidate, CANDIDATE);
      assert.equal(tx.logs[0].args.newRate, consts.LOWER_RATE);
      assert.equal(tx.logs[0].args.newLockEndTime, consts.LARGER_LOCK_END_TIME);

      tx = await dposInstance.nonIncreaseCommissionRate(
        consts.LOWER_RATE - 10,
        consts.LARGER_LOCK_END_TIME,
        { from: CANDIDATE }
      );

      assert.equal(tx.logs[0].event, 'UpdateCommissionRate');
      assert.equal(tx.logs[0].args.candidate, CANDIDATE);
      assert.equal(tx.logs[0].args.newRate, consts.LOWER_RATE - 10);
      assert.equal(tx.logs[0].args.newLockEndTime, consts.LARGER_LOCK_END_TIME);
    });

    it('should announce increase commission rate successfully', async () => {
      const tx = await dposInstance.announceIncreaseCommissionRate(
        consts.HIGHER_RATE,
        consts.LARGER_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      const { event, args } = tx.logs[0];

      assert.equal(event, 'CommissionRateAnnouncement');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.announcedRate, consts.HIGHER_RATE);
      assert.equal(args.announcedLockEndTime, consts.LARGER_LOCK_END_TIME);
    });

    describe('after announceIncreaseCommissionRate', async () => {
      beforeEach(async () => {
        await dposInstance.announceIncreaseCommissionRate(
          consts.HIGHER_RATE,
          consts.LARGER_LOCK_END_TIME,
          { from: CANDIDATE }
        );
      });

      it('should fail to confirmIncreaseCommissionRate before new rate can take effect', async () => {
        try {
          await dposInstance.confirmIncreaseCommissionRate({
            from: CANDIDATE
          });
        } catch (error) {
          assert.isAbove(error.message.search('Still in notice period'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should fail to confirmIncreaseCommissionRate after new rate can take effect but before lock end time', async () => {
        await dposInstance.nonIncreaseCommissionRate(
          consts.COMMISSION_RATE,
          consts.LARGER_LOCK_END_TIME,
          { from: CANDIDATE }
        );

        // need to announceIncreaseCommissionRate again because _updateCommissionRate
        // will remove the previous announcement of increasing commission rate
        await dposInstance.announceIncreaseCommissionRate(
          consts.HIGHER_RATE,
          consts.LARGER_LOCK_END_TIME,
          { from: CANDIDATE }
        );

        await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);

        try {
          await dposInstance.confirmIncreaseCommissionRate({
            from: CANDIDATE
          });
        } catch (error) {
          assert.isAbove(error.message.search('Commission rate is locked'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should confirmIncreaseCommissionRate successfully after new rate takes effect ', async () => {
        await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);
        const tx = await dposInstance.confirmIncreaseCommissionRate({
          from: CANDIDATE
        });
        const { event, args } = tx.logs[0];

        assert.equal(event, 'UpdateCommissionRate');
        assert.equal(args.candidate, CANDIDATE);
        assert.equal(args.newRate, consts.HIGHER_RATE);
        assert.equal(args.newLockEndTime, consts.LARGER_LOCK_END_TIME);
      });
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
      const tx = await sgnInstance.updateSidechainAddr(newSidechainAddr, {
        from: CANDIDATE
      });
      const { event, args } = tx.logs[0];

      assert.equal(event, 'UpdateSidechainAddr');
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
      assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
    });

    it('should fail to delegate for paused contract', async () => {
      await dposInstance.pause();

      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE);
      try {
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE);
      } catch (e) {
        assert.isAbove(
          e.message.search('VM Exception while processing transaction'),
          -1
        );
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should delegate to candidate by a delegator successfully', async () => {
      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE);

      const tx = await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE);
      const { event, args } = tx.logs[1];

      assert.equal(event, 'Delegate');
      assert.equal(args.delegator, DELEGATOR);
      assert.equal(args.candidate, CANDIDATE);
      assert.equal(args.newStake, consts.DELEGATOR_STAKE);
      assert.equal(args.stakingPool, consts.DELEGATOR_STAKE);
    });

    it('should fail to claimValidator before delegating enough stake', async () => {
      const stakingPool = (parseInt(consts.MIN_STAKING_POOL) - 10000).toString();
      await celerToken.approve(dposInstance.address, stakingPool);
      await dposInstance.delegate(CANDIDATE, stakingPool);

      try {
        await dposInstance.claimValidator({
          from: CANDIDATE
        });
      } catch (error) {
        assert.isAbove(error.message.search('Insufficient staking pool'), -1);
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should fail to contributeToMiningPool for unpaused state', async () => {
      await dposInstance.pause();
      await celerToken.approve(dposInstance.address, 100);

      try {
        await dposInstance.contributeToMiningPool(100);
      } catch (e) {
        assert.isAbove(
          e.message.search('VM Exception while processing transaction'),
          -1
        );
        return;
      }

      assert.fail('should have thrown before');
    });

    it('should contribute to mining pool successfully', async () => {
      const contribution = 100;
      await celerToken.approve(dposInstance.address, contribution);
      const tx = await dposInstance.contributeToMiningPool(contribution);
      const { event, args } = tx.logs[0];

      assert.equal(event, 'MiningPoolContribution');
      assert.equal(args.contributor, accounts[0]);
      assert.equal(args.contribution, contribution);
      // previous miningPoolSize is 0
      assert.equal(args.miningPoolSize, contribution);
    });

    describe('after one delegator delegates enough stake to the candidate', async () => {
      beforeEach(async () => {
        await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE);
        await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE);
      });

      it('should fail to claimValidator before self delegating minSelfStake', async () => {
        try {
          await dposInstance.claimValidator({
            from: CANDIDATE
          });
        } catch (error) {
          assert.isAbove(error.message.search('Not enough self stake'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should withdrawFromUnbondedCandidate by delegator successfully', async () => {
        const tx = await dposInstance.withdrawFromUnbondedCandidate(
          CANDIDATE,
          consts.DELEGATOR_WITHDRAW
        );
        const { event, args } = tx.logs[1];

        assert.equal(event, 'WithdrawFromUnbondedCandidate');
        assert.equal(args.delegator, DELEGATOR);
        assert.equal(args.candidate, CANDIDATE);
        assert.equal(args.amount, consts.DELEGATOR_WITHDRAW);
      });

      describe('after one candidate self delegates minSelfStake', async () => {
        beforeEach(async () => {
          await celerToken.approve(dposInstance.address, consts.CANDIDATE_STAKE, {
            from: CANDIDATE
          });
          await dposInstance.delegate(CANDIDATE, consts.CANDIDATE_STAKE, {
            from: CANDIDATE
          });
        });

        it('should claimValidator successfully', async () => {
          const tx = await dposInstance.claimValidator({
            from: CANDIDATE
          });
          const { event, args } = tx.logs[0];

          assert.equal(event, 'ValidatorChange');
          assert.equal(args.ethAddr, CANDIDATE);
          assert.equal(args.changeType, consts.VALIDATOR_ADD);
        });

        it('should increase min self stake and claimValidator successfully', async () => {
          let tx = await dposInstance.updateMinSelfStake(
            consts.HIGHER_MIN_SELF_STAKE,
            { from: CANDIDATE }
          );
          assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
          assert.equal(tx.logs[0].args.candidate, CANDIDATE);
          assert.equal(tx.logs[0].args.minSelfStake, consts.HIGHER_MIN_SELF_STAKE);

          tx = await dposInstance.claimValidator({ from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.VALIDATOR_ADD);
        });

        it('should decrease min self stake successfully but fail to claimValidator before notice period', async () => {
          const tx = await dposInstance.updateMinSelfStake(
            consts.LOWER_MIN_SELF_STAKE,
            { from: CANDIDATE }
          );
          const { event, args } = tx.logs[0];
          assert.equal(event, 'UpdateMinSelfStake');
          assert.equal(args.candidate, CANDIDATE);
          assert.equal(args.minSelfStake, consts.LOWER_MIN_SELF_STAKE);

          try {
            await dposInstance.claimValidator({ from: CANDIDATE });
          } catch (error) {
            assert.isAbove(
              error.message.search('Not earliest bond time yet'),
              -1
            );
            return;
          }

          assert.fail('should have thrown before');
        });

        it('should decrease min self stake and claimValidator after notice period successfully', async () => {
          await dposInstance.updateMinSelfStake(consts.LOWER_MIN_SELF_STAKE, {
            from: CANDIDATE
          });

          await Timetravel.advanceBlocks(consts.ADVANCE_NOTICE_PERIOD);

          const tx = await dposInstance.claimValidator({ from: CANDIDATE });
          assert.equal(tx.logs[0].event, 'ValidatorChange');
          assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
          assert.equal(tx.logs[0].args.changeType, consts.VALIDATOR_ADD);
        });

        describe('after one candidate claimValidator', async () => {
          beforeEach(async () => {
            await dposInstance.claimValidator({
              from: CANDIDATE
            });
          });

          it('should fail withdrawFromUnbondedCandidate', async () => {
            try {
              await dposInstance.withdrawFromUnbondedCandidate(
                CANDIDATE,
                consts.DELEGATOR_WITHDRAW
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
                error.message.search(
                  'Amount is smaller than minimum requirement'
                ),
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
                error.message.search(
                  'Amount is smaller than minimum requirement'
                ),
                -1
              );
              return;
            }
            assert.fail('should have thrown before');
          });

          it('should remove the validator after validator intendWithdraw to an amount under minSelfStake', async () => {
            const tx = await dposInstance.intendWithdraw(
              CANDIDATE,
              consts.CANDIDATE_WITHDRAW_UNDER_MIN,
              { from: CANDIDATE }
            );
            const block = await web3.eth.getBlock('latest');

            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
            assert.equal(tx.logs[1].args.changeType, consts.VALIDATOR_REMOVAL);

            assert.equal(tx.logs[2].event, 'IntendWithdraw');
            assert.equal(tx.logs[2].args.delegator, CANDIDATE);
            assert.equal(tx.logs[2].args.candidate, CANDIDATE);
            assert.equal(
              tx.logs[2].args.withdrawAmount,
              consts.CANDIDATE_WITHDRAW_UNDER_MIN
            );
            assert.equal(tx.logs[2].args.proposedTime.toNumber(), block.number);
          });

          it('should remove the validator after delegator intendWithdraw to an amount under minStakingPool', async () => {
            const tx = await dposInstance.intendWithdraw(
              CANDIDATE,
              consts.DELEGATOR_WITHDRAW
            );
            const block = await web3.eth.getBlock('latest');

            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
            assert.equal(tx.logs[1].args.changeType, consts.VALIDATOR_REMOVAL);

            assert.equal(tx.logs[2].event, 'IntendWithdraw');
            assert.equal(tx.logs[2].args.delegator, DELEGATOR);
            assert.equal(tx.logs[2].args.candidate, CANDIDATE);
            assert.equal(tx.logs[2].args.withdrawAmount, consts.DELEGATOR_WITHDRAW);
            assert.equal(tx.logs[2].args.proposedTime.toNumber(), block.number);
          });

          it('should increase min self stake successfully', async () => {
            const tx = await dposInstance.updateMinSelfStake(
              consts.HIGHER_MIN_SELF_STAKE,
              { from: CANDIDATE }
            );
            assert.equal(tx.logs[0].event, 'UpdateMinSelfStake');
            assert.equal(tx.logs[0].args.candidate, CANDIDATE);
            assert.equal(tx.logs[0].args.minSelfStake, consts.HIGHER_MIN_SELF_STAKE);
          });

          it('should fail to decrease min self stake', async () => {
            try {
              await dposInstance.updateMinSelfStake(consts.LOWER_MIN_SELF_STAKE, {
                from: CANDIDATE
              });
            } catch (error) {
              assert.isAbove(error.message.search('Candidate is bonded'), -1);
              return;
            }
            assert.fail('should have thrown before');
          });

          // TODO: add a test of "fail to confirmWithdraw because penalty slashes all undelegating stake"

          describe('after DPoS goes live', async () => {
            beforeEach(async () => {
              await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
            });

            it('should fail to subscribe for unpaused state', async () => {
              await sgnInstance.pause();
              await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
                from: SUBSCRIBER
              });
              try {
                await sgnInstance.subscribe(consts.SUB_FEE, {
                  from: SUBSCRIBER
                });
              } catch (e) {
                assert.isAbove(
                  e.message.search('VM Exception while processing transaction'),
                  -1
                );
                return;
              }

              assert.fail('should have thrown before');
            });

            // TODO: use a describe for the following when condition
            it('should subscribe successfully when there are enough validators', async () => {
              await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
                from: SUBSCRIBER
              });
              const tx = await sgnInstance.subscribe(consts.SUB_FEE, {
                from: SUBSCRIBER
              });
              const { event, args } = tx.logs[0];

              assert.equal(event, 'AddSubscriptionBalance');
              assert.equal(args.consumer, SUBSCRIBER);
              assert.equal(args.amount, consts.SUB_FEE);
            });

            it('should fail to slash for unpaused state', async () => {
              await dposInstance.pause();

              try {
                const request = await getPenaltyRequestBytes({
                  nonce: 1,
                  expireTime: 1000000,
                  validatorAddr: [CANDIDATE],
                  delegatorAddrs: [CANDIDATE, DELEGATOR],
                  delegatorAmts: [5, 10],
                  beneficiaryAddrs: [consts.ZERO_ADDR, SUBSCRIBER],
                  beneficiaryAmts: [7, 8],
                  signers: [CANDIDATE]
                });
                await dposInstance.slash(request);
              } catch (e) {
                assert.isAbove(
                  e.message.search('VM Exception while processing transaction'),
                  -1
                );
                return;
              }

              assert.fail('should have thrown before');
            });

            it('should slash successfully', async () => {
              const oldMiningPool = await dposInstance.miningPool();
              const oldTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

              const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [CANDIDATE],
                delegatorAddrs: [CANDIDATE, DELEGATOR],
                delegatorAmts: [5, 10],
                beneficiaryAddrs: [consts.ZERO_ADDR, SUBSCRIBER],
                beneficiaryAmts: [7, 8],
                signers: [CANDIDATE]
              });
              const tx = await dposInstance.slash(request);
              const newMiningPool = await dposInstance.miningPool();
              const newTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

              assert.equal(tx.logs[0].event, 'Slash');
              assert.equal(tx.logs[0].args.validator, CANDIDATE);
              assert.equal(tx.logs[0].args.delegator, CANDIDATE);
              assert.equal(tx.logs[0].args.amount, 5);

              assert.equal(tx.logs[2].event, 'Slash');
              assert.equal(tx.logs[2].args.validator, CANDIDATE);
              assert.equal(tx.logs[2].args.delegator, DELEGATOR);
              assert.equal(tx.logs[2].args.amount, 10);

              assert.equal(
                newMiningPool.toString(),
                oldMiningPool.addn(7).toString()
              );
              assert.equal(
                newTokenAmt.toString(),
                oldTokenAmt.addn(8).toString()
              );
            });

            it('should fail to slash with same request twice', async () => {
              const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [CANDIDATE],
                delegatorAddrs: [CANDIDATE, DELEGATOR],
                delegatorAmts: [5, 10],
                beneficiaryAddrs: [consts.ZERO_ADDR, SUBSCRIBER],
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
                beneficiaryAddrs: [consts.ZERO_ADDR, SUBSCRIBER],
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
                beneficiaryAddrs: [consts.ZERO_ADDR, SUBSCRIBER],
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

            it('should fail to redeem reward for unpaused state', async () => {
              await sgnInstance.pause();

              try {
                const rewardRequest = await getRewardRequestBytes({
                  receiver: accounts[9],
                  cumulativeMiningReward: 100,
                  cumulativeServiceReward: 0,
                  signers: [CANDIDATE]
                });
                await sgnInstance.redeemReward(rewardRequest);
              } catch (e) {
                assert.isAbove(
                  e.message.search('VM Exception while processing transaction'),
                  -1
                );
                return;
              }

              assert.fail('should have thrown before');
            });

            it('should redeem reward successfully', async () => {
              // contribute to mining pool
              const contribution = 100;
              await celerToken.approve(dposInstance.address, contribution);
              await dposInstance.contributeToMiningPool(contribution);

              // submit subscription fees
              await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
                from: SUBSCRIBER
              });
              await sgnInstance.subscribe(consts.SUB_FEE, {
                from: SUBSCRIBER
              });

              const receiver = accounts[9];
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
              assert.equal(
                tx.logs[0].args.cumulativeMiningReward,
                miningReward
              );
              assert.equal(tx.logs[0].args.serviceReward, serviceReward);
              assert.equal(
                tx.logs[0].args.servicePool,
                consts.SUB_FEE - serviceReward
              );

              // TODO: add checks for RedeemMiningReward event (hash is the only way to validate it)
            });

            it('should fail to redeem reward more than amount in mining pool', async () => {
              // contribute to mining pool
              const contribution = 100;
              await celerToken.approve(dposInstance.address, contribution);
              await dposInstance.contributeToMiningPool(contribution);

              const rewardRequest = await getRewardRequestBytes({
                receiver: accounts[9],
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
              // submit subscription fees
              await celerToken.approve(sgnInstance.address, consts.SUB_FEE, {
                from: SUBSCRIBER
              });
              await sgnInstance.subscribe(consts.SUB_FEE, {
                from: SUBSCRIBER
              });

              const rewardRequest = await getRewardRequestBytes({
                receiver: accounts[9],
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

          describe('after a delegator intendWithdraw', async () => {
            beforeEach(async () => {
              await dposInstance.intendWithdraw(CANDIDATE, consts.DELEGATOR_WITHDRAW);
            });

            it('should confirmWithdraw 0 before withdrawTimeout', async () => {
              const tx = await dposInstance.confirmWithdraw(CANDIDATE);
              const { event, args } = tx.logs[0];

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
                const tx = await dposInstance.confirmWithdraw(CANDIDATE);
                const { event, args } = tx.logs[0];

                assert.equal(event, 'ConfirmWithdraw');
                assert.equal(args.delegator, DELEGATOR);
                assert.equal(args.candidate, CANDIDATE);
                assert.equal(args.amount, consts.DELEGATOR_WITHDRAW);
              });

              describe('after confirmWithdraw', async () => {
                beforeEach(async () => {
                  await dposInstance.confirmWithdraw(CANDIDATE);
                });

                it('should confirmWithdraw 0 after all withdraw intents are cleared', async () => {
                  const tx = await dposInstance.confirmWithdraw(CANDIDATE);
                  const { event, args } = tx.logs[0];

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

  describe('after multiple number of validators join the validator set', async () => {
    const VALIDATORS = [accounts[1], accounts[2], accounts[3], accounts[4]];
    const NON_VALIDATOR = accounts[5];
    const SELF_STAKE = '6000000000000000000';

    beforeEach(async () => {
      for (let i = 0; i < VALIDATORS.length; i++) {
        // validators finish initialization
        const sidechainAddr = sha3(VALIDATORS[i]);
        await dposInstance.initializeCandidate(
          consts.MIN_SELF_STAKE,
          consts.COMMISSION_RATE,
          consts.RATE_LOCK_END_TIME,
          { from: VALIDATORS[i] }
        );
        await sgnInstance.updateSidechainAddr(sidechainAddr, {
          from: VALIDATORS[i]
        });

        await celerToken.approve(dposInstance.address, SELF_STAKE, {
          from: VALIDATORS[i]
        });
        await dposInstance.delegate(VALIDATORS[i], SELF_STAKE, {
          from: VALIDATORS[i]
        });

        // validators claimValidator
        await dposInstance.claimValidator({
          from: VALIDATORS[i]
        });
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
        assert.isAbove(
          error.message.search('Fail to check validator sigs'),
          -1
        );
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

    it('should createParamProposal successfully', async () => {
      const newSlashTimeout = consts.SLASH_TIMEOUT + 1;

      await celerToken.approve(dposInstance.address, consts.GOVERN_PROPOSAL_DEPOSIT);
      const tx = await dposInstance.createParamProposal(
        consts.ENUM_SLASH_TIMEOUT,
        newSlashTimeout
      );
      const block = await web3.eth.getBlock('latest');
      const { event, args } = tx.logs[0];

      assert.equal(event, 'CreateParamProposal');
      assert.equal(args.proposalId, 0);
      assert.equal(args.proposer, accounts[0]);
      assert.equal(args.deposit, consts.GOVERN_PROPOSAL_DEPOSIT);
      assert.equal(args.voteDeadline, block.number + consts.GOVERN_VOTE_TIMEOUT);
      assert.equal(args.record, consts.ENUM_SLASH_TIMEOUT);
      assert.equal(args.newValue, newSlashTimeout);
    });

    describe('after someone createParamProposal successfully', async () => {
      const proposalId = 0;

      beforeEach(async () => {
        await celerToken.approve(dposInstance.address, consts.GOVERN_PROPOSAL_DEPOSIT);
        await dposInstance.createParamProposal(
          consts.ENUM_MIGRATION_TIME,
          consts.MIGRATOIN_START_TIME
        );
      });

      it('should fail to voteParam if not validator', async () => {
        try {
          await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {
            from: NON_VALIDATOR
          });
        } catch (error) {
          assert.isAbove(
            error.message.search('msg sender is not a validator'),
            -1
          );
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should fail to voteParam for a proposal with an invalid status', async () => {
        const invalidProposalId = proposalId + 1;
        try {
          await dposInstance.voteParam(invalidProposalId, consts.ENUM_VOTE_TYPE_YES, {
            from: VALIDATORS[0]
          });
        } catch (error) {
          assert.isAbove(error.message.search('Invalid proposal status'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should vote successfully as a validator', async () => {
        const tx = await dposInstance.voteParam(
          proposalId,
          consts.ENUM_VOTE_TYPE_YES,
          { from: VALIDATORS[0] }
        );
        const { event, args } = tx.logs[0];

        assert.equal(event, 'VoteParam');
        assert.equal(args.proposalId, proposalId);
        assert.equal(args.voter, VALIDATORS[0]);
        assert.equal(args.voteType, consts.ENUM_VOTE_TYPE_YES);
      });

      describe('after a validtor votes successfully', async () => {
        beforeEach(async () => {
          await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {
            from: VALIDATORS[0]
          });
        });

        it('should fail to vote for the same proposal twice', async () => {
          try {
            await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {
              from: VALIDATORS[0]
            });
          } catch (error) {
            assert.isAbove(error.message.search('Voter has voted'), -1);
            return;
          }

          assert.fail('should have thrown before');
        });

        it('should vote successfully as another validator', async () => {
          const tx = await dposInstance.voteParam(
            proposalId,
            consts.ENUM_VOTE_TYPE_YES,
            { from: VALIDATORS[1] }
          );
          const { event, args } = tx.logs[0];

          assert.equal(event, 'VoteParam');
          assert.equal(args.proposalId, proposalId);
          assert.equal(args.voter, VALIDATORS[1]);
          assert.equal(args.voteType, consts.ENUM_VOTE_TYPE_YES);
        });

        it('should fail to confirmParamProposal before the vote deadline', async () => {
          try {
            await dposInstance.confirmParamProposal(proposalId);
          } catch (error) {
            assert.isAbove(
              error.message.search('Vote deadline not reached'),
              -1
            );
            return;
          }

          assert.fail('should have thrown before');
        });

        describe('after passing the vote deadline', async () => {
          beforeEach(async () => {
            await Timetravel.advanceBlocks(consts.GOVERN_VOTE_TIMEOUT);
          });

          it('should fail to vote after the vote deadline', async () => {
            try {
              await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {
                from: VALIDATORS[2]
              });
            } catch (error) {
              assert.isAbove(error.message.search('Vote deadline reached'), -1);
              return;
            }

            assert.fail('should have thrown before');
          });

          it('should confirmParamProposal (reject proposal case) successfully', async () => {
            const tx = await dposInstance.confirmParamProposal(proposalId);
            const { event, args } = tx.logs[0];

            assert.equal(event, 'ConfirmParamProposal');
            assert.equal(args.proposalId, proposalId);
            assert.equal(args.passed, false);
            assert.equal(args.record, consts.ENUM_MIGRATION_TIME);
            assert.equal(args.newValue, consts.MIGRATOIN_START_TIME);
          });
        });
      });

      describe('after over 2/3 voting power votes for Yes', async () => {
        beforeEach(async () => {
          const majorNum = Math.ceil((VALIDATORS.length * 2) / 3);
          for (let i = 0; i < majorNum; i++) {
            await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {
              from: VALIDATORS[i]
            });
          }
        });

        describe('after passing the vote deadline', async () => {
          beforeEach(async () => {
            await Timetravel.advanceBlocks(consts.GOVERN_VOTE_TIMEOUT);
          });

          it('should confirmParamProposal (accept proposal case) successfully', async () => {
            const tx = await dposInstance.confirmParamProposal(proposalId);
            const { event, args } = tx.logs[0];
            const queriedMigrationTime = await dposInstance.getUIntValue(
              consts.ENUM_MIGRATION_TIME
            );

            assert.equal(event, 'ConfirmParamProposal');
            assert.equal(args.proposalId, proposalId);
            assert.equal(args.passed, true);
            assert.equal(args.record, consts.ENUM_MIGRATION_TIME);
            assert.equal(args.newValue, consts.MIGRATOIN_START_TIME);
            assert.equal(queriedMigrationTime, consts.MIGRATOIN_START_TIME);
          });

          it('should fail to slash in migrating state', async () => {
            await dposInstance.confirmParamProposal(proposalId);
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

            try {
              await dposInstance.slash(request);
            } catch (error) {
              assert.isAbove(error.message.search('contract migrating'), -1);
              return;
            }

            assert.fail('should have thrown before');
          });
        });
      });
    });

    // sidechain governance tests
    it('should createSidechainProposal successfully', async () => {
      await celerToken.approve(dposInstance.address, consts.GOVERN_PROPOSAL_DEPOSIT);
      const newRegistrationStatus = true;
      const tx = await dposInstance.createSidechainProposal(
        consts.ONE_ADDR,
        newRegistrationStatus
      );
      const block = await web3.eth.getBlock('latest');
      const { event, args } = tx.logs[0];

      assert.equal(event, 'CreateSidechainProposal');
      assert.equal(args.proposalId, 0);
      assert.equal(args.proposer, accounts[0]);
      assert.equal(args.deposit, consts.GOVERN_PROPOSAL_DEPOSIT);
      assert.equal(args.voteDeadline, block.number + consts.GOVERN_VOTE_TIMEOUT);
      assert.equal(args.sidechainAddr, consts.ONE_ADDR);
      assert.equal(args.registered, newRegistrationStatus);
    });

    describe('after someone createSidechainProposal(register a new sidechain) successfully', async () => {
      const proposalId = 0;
      const newRegistrationStatus = true;

      beforeEach(async () => {
        await celerToken.approve(dposInstance.address, consts.GOVERN_PROPOSAL_DEPOSIT);
        await dposInstance.createSidechainProposal(
          consts.ONE_ADDR,
          newRegistrationStatus
        );
      });

      it('should fail to voteSidechain if not validator', async () => {
        try {
          await dposInstance.voteSidechain(proposalId, consts.ENUM_VOTE_TYPE_YES, {
            from: NON_VALIDATOR
          });
        } catch (error) {
          assert.isAbove(
            error.message.search('msg sender is not a validator'),
            -1
          );
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should fail to voteSidechain for a proposal with an invalid status', async () => {
        const invalidProposalId = proposalId + 1;
        try {
          await dposInstance.voteSidechain(
            invalidProposalId,
            consts.ENUM_VOTE_TYPE_YES,
            { from: VALIDATORS[0] }
          );
        } catch (error) {
          assert.isAbove(error.message.search('Invalid proposal status'), -1);
          return;
        }

        assert.fail('should have thrown before');
      });

      it('should vote successfully as a validator', async () => {
        const tx = await dposInstance.voteSidechain(
          proposalId,
          consts.ENUM_VOTE_TYPE_YES,
          { from: VALIDATORS[0] }
        );
        const { event, args } = tx.logs[0];

        assert.equal(event, 'VoteSidechain');
        assert.equal(args.proposalId, proposalId);
        assert.equal(args.voter, VALIDATORS[0]);
        assert.equal(args.voteType, consts.ENUM_VOTE_TYPE_YES);
      });

      describe('after a validtor votes successfully', async () => {
        beforeEach(async () => {
          await dposInstance.voteSidechain(proposalId, consts.ENUM_VOTE_TYPE_YES, {
            from: VALIDATORS[0]
          });
        });

        it('should fail to vote for the same proposal twice', async () => {
          try {
            await dposInstance.voteSidechain(proposalId, consts.ENUM_VOTE_TYPE_YES, {
              from: VALIDATORS[0]
            });
          } catch (error) {
            assert.isAbove(error.message.search('Voter has voted'), -1);
            return;
          }

          assert.fail('should have thrown before');
        });

        it('should vote successfully as another validator', async () => {
          const tx = await dposInstance.voteSidechain(
            proposalId,
            consts.ENUM_VOTE_TYPE_YES,
            { from: VALIDATORS[1] }
          );
          const { event, args } = tx.logs[0];

          assert.equal(event, 'VoteSidechain');
          assert.equal(args.proposalId, proposalId);
          assert.equal(args.voter, VALIDATORS[1]);
          assert.equal(args.voteType, consts.ENUM_VOTE_TYPE_YES);
        });

        it('should fail to confirmSidechainProposal before the vote deadline', async () => {
          try {
            await dposInstance.confirmSidechainProposal(proposalId);
          } catch (error) {
            assert.isAbove(
              error.message.search('Vote deadline not reached'),
              -1
            );
            return;
          }

          assert.fail('should have thrown before');
        });

        describe('after passing the vote deadline', async () => {
          beforeEach(async () => {
            await Timetravel.advanceBlocks(consts.GOVERN_VOTE_TIMEOUT);
          });

          it('should fail to vote after the vote deadline', async () => {
            try {
              await dposInstance.voteSidechain(proposalId, consts.ENUM_VOTE_TYPE_YES, {
                from: VALIDATORS[2]
              });
            } catch (error) {
              assert.isAbove(error.message.search('Vote deadline reached'), -1);
              return;
            }

            assert.fail('should have thrown before');
          });

          it('should confirmSidechainProposal (reject proposal case) successfully', async () => {
            const tx = await dposInstance.confirmSidechainProposal(proposalId);
            const { event, args } = tx.logs[0];

            assert.equal(event, 'ConfirmSidechainProposal');
            assert.equal(args.proposalId, proposalId);
            assert.equal(args.passed, false);
            assert.equal(args.sidechainAddr, consts.ONE_ADDR);
            assert.equal(args.registered, newRegistrationStatus);
          });
        });
      });

      describe('after over 2/3 voting power votes for Yes', async () => {
        beforeEach(async () => {
          const majorNum = Math.ceil((VALIDATORS.length * 2) / 3);
          for (let i = 0; i < majorNum; i++) {
            await dposInstance.voteSidechain(proposalId, consts.ENUM_VOTE_TYPE_YES, {
              from: VALIDATORS[i]
            });
          }
        });

        describe('after passing the vote deadline', async () => {
          beforeEach(async () => {
            await Timetravel.advanceBlocks(consts.GOVERN_VOTE_TIMEOUT);
          });

          it('should confirmSidechainProposal (accept proposal case) successfully', async () => {
            const tx = await dposInstance.confirmSidechainProposal(proposalId);
            const { event, args } = tx.logs[0];
            const queriedRegistrationStatus = await dposInstance.isSidechainRegistered(
              consts.ONE_ADDR
            );

            assert.equal(event, 'ConfirmSidechainProposal');
            assert.equal(args.proposalId, proposalId);
            assert.equal(args.passed, true);
            assert.equal(args.sidechainAddr, consts.ONE_ADDR);
            assert.equal(args.registered, newRegistrationStatus);
            assert.equal(queriedRegistrationStatus, newRegistrationStatus);
          });

          describe('after registering a new sidechain', async () => {
            beforeEach(async () => {
              await dposInstance.confirmSidechainProposal(proposalId);
            });

            it('should be able to unregister this sidechain successfully', async () => {
              const registrationStatus = false;
              const unregisterProposalId = proposalId + 1;

              // createSidechainProposal
              await celerToken.approve(
                dposInstance.address,
                consts.GOVERN_PROPOSAL_DEPOSIT
              );
              await dposInstance.createSidechainProposal(
                consts.ONE_ADDR,
                registrationStatus
              );

              // after over 2/3 voting power votes for Yes
              const majorNum = Math.ceil((VALIDATORS.length * 2) / 3);
              for (let i = 0; i < majorNum; i++) {
                await dposInstance.voteSidechain(
                  unregisterProposalId,
                  consts.ENUM_VOTE_TYPE_YES,
                  { from: VALIDATORS[i] }
                );
              }

              // pass vote deadline
              await Timetravel.advanceBlocks(consts.GOVERN_VOTE_TIMEOUT);

              // confirmSidechainProposal
              const tx = await dposInstance.confirmSidechainProposal(
                unregisterProposalId
              );
              const { event, args } = tx.logs[0];
              const queriedRegistrationStatus = await dposInstance.isSidechainRegistered(
                consts.ONE_ADDR
              );

              assert.equal(event, 'ConfirmSidechainProposal');
              assert.equal(args.proposalId, unregisterProposalId);
              assert.equal(args.passed, true);
              assert.equal(args.sidechainAddr, consts.ONE_ADDR);
              assert.equal(args.registered, registrationStatus);
              assert.equal(queriedRegistrationStatus, registrationStatus);
            });
          });
        });
      });
    });
  });

  describe('after max number of validators join the validator set and sidechain goes live', async () => {
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

    beforeEach(async () => {
      for (let i = 0; i < VALIDATORS.length; i++) {
        const sidechainAddr = sha3(VALIDATORS[i]);
        await dposInstance.initializeCandidate(
          consts.MIN_SELF_STAKE,
          consts.COMMISSION_RATE,
          consts.RATE_LOCK_END_TIME,
          { from: VALIDATORS[i] }
        );
        await sgnInstance.updateSidechainAddr(sidechainAddr, {
          from: VALIDATORS[i]
        });

        await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {
          from: VALIDATORS[i]
        });
        await dposInstance.delegate(VALIDATORS[i], consts.MIN_STAKING_POOL, {
          from: VALIDATORS[i]
        });

        await dposInstance.claimValidator({
          from: VALIDATORS[i]
        });
      }
    });

    it('should getMinQuorumStakingPool successfully', async () => {
      const number = await dposInstance.getValidatorNum();
      const quorumStakingPool = await dposInstance.getMinQuorumStakingPool();

      assert.equal(number.toNumber(), VALIDATORS.length);
      assert.equal(quorumStakingPool.toString(), '29333333333333333334');
    });

    it('should fail to claimValidator with low stake', async () => {
      const sidechainAddr = sha3(CANDIDATE);
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {
        from: CANDIDATE
      });

      await celerToken.approve(dposInstance.address, consts.MIN_STAKING_POOL, {
        from: CANDIDATE
      });
      await dposInstance.delegate(CANDIDATE, consts.MIN_STAKING_POOL, {
        from: CANDIDATE
      });

      try {
        await dposInstance.claimValidator({
          from: CANDIDATE
        });
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
      const sidechainAddr = sha3(CANDIDATE);
      await dposInstance.initializeCandidate(
        consts.MIN_SELF_STAKE,
        consts.COMMISSION_RATE,
        consts.RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {
        from: CANDIDATE
      });

      await celerToken.approve(dposInstance.address, consts.DELEGATOR_STAKE, {
        from: CANDIDATE
      });
      await dposInstance.delegate(CANDIDATE, consts.DELEGATOR_STAKE, {
        from: CANDIDATE
      });

      const tx = await dposInstance.claimValidator({ from: CANDIDATE });

      assert.equal(tx.logs[0].event, 'ValidatorChange');
      assert.equal(tx.logs[0].args.ethAddr, accounts[2]);
      assert.equal(tx.logs[0].args.changeType, consts.VALIDATOR_REMOVAL);
      assert.equal(tx.logs[1].event, 'ValidatorChange');
      assert.equal(tx.logs[1].args.ethAddr, CANDIDATE);
      assert.equal(tx.logs[1].args.changeType, consts.VALIDATOR_ADD);
    });
  });
});
