const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const CELRToken = artifacts.require('CELRToken');

const GANACHE_ACCOUNT_NUM = 20; // defined in .circleci/config.yml
const GOVERN_PROPOSAL_DEPOSIT = 100;
const GOVERN_VOTE_TIMEOUT = 20;
const SLASH_TIMEOUT = 50;
const VALIDATOR_ADD = 0;
const VALIDATOR_REMOVAL = 1;
const MIN_VALIDATOR_NUM = 1;
const DPOS_GO_LIVE_TIMEOUT = 50;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ONE_ADDR = '0x0000000000000000000000000000000000000001';
// value of an indexed null bytes
const HASHED_NULL =
  '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

const COMMISSION_RATE = 100;
const LOWER_RATE = 50;
const HIGHER_RATE = 200;
const RATE_LOCK_END_TIME = 2;
const LARGER_LOCK_END_TIME = 100000;
const ADVANCE_NOTICE_PERIOD = 100; // in practice, this should be 80640 (2 weeks)

const MIN_STAKING_POOL = '4000000000000000000'; // need to be larger than CANDIDATE_STAKE for test purpose
const MIN_SELF_STAKE = '2000000000000000000';
const HIGHER_MIN_SELF_STAKE = '3000000000000000000';
const LOWER_MIN_SELF_STAKE = '1000000000000000000';

const ENUM_SLASH_TIMEOUT = 2;
const ENUM_MIGRATION_TIME = 7;
const MIGRATOIN_START_TIME = 10;

const ENUM_VOTE_TYPE_YES = 1;

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('DPoS and SGN contracts', async accounts => {
  const DELEGATOR = accounts[0];
  const DELEGATOR_STAKE = '5000000000000000000';
  const DELEGATOR_WITHDRAW = '5000000000000000000';
  const CANDIDATE = accounts[1];
  const CANDIDATE_STAKE = '3000000000000000000';
  const CANDIDATE_WITHDRAW_UNDER_MIN = '1000000000000000001'; // CANDIDATE_STAKE - CANDIDATE_WITHDRAW_UNDER_MIN < MIN_SELF_STAKE
  const SUBSCRIBER = accounts[2];
  const SUB_FEE = 100;
  const MAX_VALIDATOR_NUM = 11;

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
      GOVERN_PROPOSAL_DEPOSIT,
      GOVERN_VOTE_TIMEOUT,
      SLASH_TIMEOUT,
      MIN_VALIDATOR_NUM,
      MAX_VALIDATOR_NUM,
      MIN_STAKING_POOL,
      ADVANCE_NOTICE_PERIOD,
      DPOS_GO_LIVE_TIMEOUT
    );

    sgnInstance = await SGN.new(celerToken.address, dposInstance.address);

    await dposInstance.registerSidechain(sgnInstance.address);

    // give enough money to other accounts
    for (let i = 1; i < GANACHE_ACCOUNT_NUM; i++) {
      await celerToken.transfer(accounts[i], '10000000000000000000');
    }
  });

  describe('after one candidate finishes initialization', async () => {
    const sidechainAddr = sha3(CANDIDATE);

    beforeEach(async () => {
      await dposInstance.initializeCandidate(
        MIN_SELF_STAKE,
        COMMISSION_RATE,
        RATE_LOCK_END_TIME,
        { from: CANDIDATE }
      );
      await sgnInstance.updateSidechainAddr(sidechainAddr, {
        from: CANDIDATE
      });
    });

    describe('after announceIncreaseCommissionRate', async () => {
      beforeEach(async () => {
        await dposInstance.announceIncreaseCommissionRate(
          HIGHER_RATE,
          LARGER_LOCK_END_TIME,
          { from: CANDIDATE }
        );
      });

      describe('after one delegator delegates enough stake to the candidate', async () => {
        beforeEach(async () => {
          await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);
          await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
        });

        describe('after one candidate self delegates minSelfStake', async () => {
          beforeEach(async () => {
            await celerToken.approve(dposInstance.address, CANDIDATE_STAKE, {
              from: CANDIDATE
            });
            await dposInstance.delegate(CANDIDATE, CANDIDATE_STAKE, {
              from: CANDIDATE
            });
          });

          describe('after one candidate claimValidator', async () => {
            beforeEach(async () => {
              await dposInstance.claimValidator({
                from: CANDIDATE
              });
            });

            describe('after DPoS goes live', async () => {
              beforeEach(async () => {
                await Timetravel.advanceBlocks(DPOS_GO_LIVE_TIMEOUT);
              });

              it('should slash successfully', async () => {
                const oldMiningPool = await dposInstance.miningPool();
                const oldTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

                const payload = {
                  nonce: 1,
                  expireTime: 1000000,
                  validatorAddr: [CANDIDATE],
                  delegatorAddrs: [CANDIDATE],
                  delegatorAmts: [5],
                  beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                  beneficiaryAmts: [5, 300],
                  signers: [CANDIDATE]
                };

                for (let i = 0; i < 300; i++) {
                  payload.delegatorAddrs.push(DELEGATOR);
                  payload.delegatorAmts.push(1);
                }
                const request = await getPenaltyRequestBytes(payload);
                const tx = await dposInstance.slash(request);
                const newMiningPool = await dposInstance.miningPool();
                const newTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

                console.log(tx.receipt.gasUsed);
                assert.equal(tx.logs[0].event, 'Slash');
                assert.equal(tx.logs[0].args.validator, CANDIDATE);
                assert.equal(tx.logs[0].args.delegator, CANDIDATE);
                assert.equal(tx.logs[0].args.amount, 5);

                assert.equal(tx.logs[2].event, 'Slash');
                assert.equal(tx.logs[2].args.validator, CANDIDATE);
                assert.equal(tx.logs[2].args.delegator, DELEGATOR);
                assert.equal(tx.logs[2].args.amount, 1);

                assert.equal(
                  newMiningPool.toString(),
                  oldMiningPool.addn(5).toString()
                );
                assert.equal(
                  newTokenAmt.toString(),
                  oldTokenAmt.addn(300).toString()
                );
              });
            });
          });
        });
      });
    });
  });
});
