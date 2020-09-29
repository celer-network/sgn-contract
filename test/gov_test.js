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
        { from: VALIDATORS[i] }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {from: VALIDATORS[i]});

      await celerToken.approve(dposInstance.address, SELF_STAKE, {from: VALIDATORS[i]});
      await dposInstance.delegate(VALIDATORS[i], SELF_STAKE, {from: VALIDATORS[i]});

      // validators claimValidator
      await dposInstance.claimValidator({from: VALIDATORS[i]});
    }

    await Timetravel.advanceBlocks(consts.DPOS_GO_LIVE_TIMEOUT);
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
        await dposInstance.voteParam(proposalId, consts.ENUM_VOTE_TYPE_YES, {from: NON_VALIDATOR});
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
