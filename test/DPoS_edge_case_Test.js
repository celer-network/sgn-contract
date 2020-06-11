const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');

const GANACHE_ACCOUNT_NUM = 5; // defined in .circleci/config.yml
const GOVERN_PROPOSAL_DEPOSIT = 100;
const GOVERN_VOTE_TIMEOUT = 20;
const BLAME_TIMEOUT = 50;
const VALIDATOR_ADD = 0;
const VALIDATOR_REMOVAL = 1;
const MIN_VALIDATOR_NUM = 1;
// need to be larger than CANDIDATE_STAKE for test purpose
const MIN_STAKING_POOL = 80;
const DPOS_GO_LIVE_TIMEOUT = 50;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ONE_ADDR = '0x0000000000000000000000000000000000000001';
const ZERO_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
// value of an indexed null bytes
const HASHED_NULL =
  '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

const COMMISSION_RATE = 100;
const LOWER_RATE = 50;
const HIGHER_RATE = 200;
const RATE_LOCK_END_TIME = 2;
const LARGER_LOCK_END_TIME = 100000;
const INCREASE_RATE_WAIT_TIME = 100; // in practice, this should be 80640 (2 weeks)
const MIN_SELF_STAKE = 20;
const MAX_VALIDATOR_NUM = 11;

const ENUM_BLAME_TIMEOUT = 2;
const ENUM_VOTE_TYPE_YES = 1;

const DELEGATOR_STAKE = 100;
const DELEGATOR_WITHDRAW = 80;
const CANDIDATE_STAKE = 40;
const CANDIDATE_WITHDRAW_UNDER_MIN = 30;

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('DPoS edge case', async (accounts) => {
  const DELEGATOR = accounts[0];
  const CANDIDATE = accounts[1];
  // CANDIDATE_STAKE - CANDIDATE_WITHDRAW_UNDER_MIN < MIN_SELF_STAKE

  let celerToken;
  // let instance;
  let dposInstance;

  beforeEach(async () => {
    celerToken = await ERC20ExampleToken.new();

    dposInstance = await DPoS.new(
      celerToken.address,
      GOVERN_PROPOSAL_DEPOSIT,
      GOVERN_VOTE_TIMEOUT,
      BLAME_TIMEOUT,
      MIN_VALIDATOR_NUM,
      MAX_VALIDATOR_NUM,
      MIN_STAKING_POOL,
      INCREASE_RATE_WAIT_TIME,
      DPOS_GO_LIVE_TIMEOUT
    );

    // give enough money to other accounts
    for (let i = 1; i < GANACHE_ACCOUNT_NUM; i++) {
      await celerToken.transfer(accounts[i], 10000000);
    }
  });

  it('should delegate to candidate by a delegator successfully', async () => {
    await dposInstance.initializeCandidate(
      MIN_SELF_STAKE,
      COMMISSION_RATE,
      RATE_LOCK_END_TIME,
      { from: CANDIDATE }
    );
    await celerToken.approve(dposInstance.address, 10 * DELEGATOR_STAKE);

    await dposInstance.delegate(CANDIDATE, 2 * DELEGATOR_STAKE);
    await dposInstance.intendWithdraw(CANDIDATE, DELEGATOR_STAKE);
    await dposInstance.confirmWithdraw(CANDIDATE);
    await dposInstance.delegate(CANDIDATE, 2 * DELEGATOR_STAKE);
    await dposInstance.intendWithdraw(CANDIDATE, DELEGATOR_STAKE);

    let res = await dposInstance.getDelegatorInfo.call(CANDIDATE, DELEGATOR);
    console.log(res);
  });
});
