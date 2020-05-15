const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');

const GANACHE_ACCOUNT_NUM = 20; // defined in .circleci/config.yml
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
const ZERO_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
// value of an indexed null bytes
const HASHED_NULL = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

const COMMISSION_RATE = 100;
const LOWER_RATE = 50;
const HIGHER_RATE = 200;
const RATE_LOCK_END_TIME = 2;
const LARGER_LOCK_END_TIME = 100000;
const INCREASE_RATE_WAIT_TIME = 100;  // in practice, this should be 80640 (2 weeks)

const ENUM_BLAME_TIMEOUT = 2;
const ENUM_VOTE_TYPE_YES = 1;

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('DPoS and SGN contracts', async accounts => {
    const DELEGATOR = accounts[0];
    const DELEGATOR_STAKE = 100;
    const DELEGATOR_WITHDRAW = 80;
    const CANDIDATE = accounts[1];
    const MIN_SELF_STAKE = 20;
    const CANDIDATE_STAKE = 40;
    // CANDIDATE_STAKE - CANDIDATE_WITHDRAW_UNDER_MIN < MIN_SELF_STAKE
    const CANDIDATE_WITHDRAW_UNDER_MIN = 30;
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

        sgnInstance = await SGN.new(
            celerToken.address,
            dposInstance.address
        );

        await dposInstance.registerSidechain(sgnInstance.address);

        // give enough money to other accounts
        for (let i = 1; i < GANACHE_ACCOUNT_NUM; i++) {
            await celerToken.transfer(accounts[i], 10000000);
        }
    });

    it('should fail to delegate to an uninitialized candidate', async () => {
        await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);

        try {
            await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
        } catch (error) {
            assert.isAbove(error.message.search('Candidate is not initialized'), -1);
            return;
        }

        assert.fail('should have thrown before');
    });

    it('should fail to subscribe before sidechain goes live', async () => {
        await celerToken.approve(sgnInstance.address, SUB_FEE, {
            from: SUBSCRIBER
        });

        try {
            await sgnInstance.subscribe(SUB_FEE, {
                from: SUBSCRIBER
            });
        } catch (error) {
            assert.isAbove(error.message.search('DPoS is not valid'), -1);
            return;
        }

        assert.fail('should have thrown before');
    });

    it('should fail to subscribe before there are enough validators', async () => {
        await Timetravel.advanceBlocks(DPOS_GO_LIVE_TIMEOUT);
        await celerToken.approve(sgnInstance.address, SUB_FEE, {
            from: SUBSCRIBER
        });

        try {
            await sgnInstance.subscribe(SUB_FEE, {
                from: SUBSCRIBER
            });
        } catch (error) {
            assert.isAbove(error.message.search('DPoS is not valid'), -1);
            return;
        }

        assert.fail('should have thrown before');
    });

    it('should initialize a candidate successfully', async () => {
        let tx = await dposInstance.initializeCandidate(
            MIN_SELF_STAKE,
            COMMISSION_RATE,
            RATE_LOCK_END_TIME,
            { from: CANDIDATE }
        );
        assert.equal(tx.logs[0].event, 'InitializeCandidate');
        assert.equal(tx.logs[0].args.candidate, CANDIDATE);
        assert.equal(tx.logs[0].args.minSelfStake, MIN_SELF_STAKE);
        assert.equal(tx.logs[0].args.commissionRate, COMMISSION_RATE);
        assert.equal(tx.logs[0].args.rateLockEndTime, RATE_LOCK_END_TIME);

        const sidechainAddr = sha3(CANDIDATE);
        tx = await sgnInstance.updateSidechainAddr(
            sidechainAddr,
            { from: CANDIDATE }
        );
        assert.equal(tx.logs[0].event, 'UpdateSidechainAddr');
        assert.equal(tx.logs[0].args.candidate, CANDIDATE);
        assert.equal(tx.logs[0].args.oldSidechainAddr, HASHED_NULL);
        assert.equal(tx.logs[0].args.newSidechainAddr, sha3(sidechainAddr));
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
            await sgnInstance.updateSidechainAddr(
                sidechainAddr,
                { from: CANDIDATE }
            );
        });

        it('should increase the rate lock end time successfully', async () => {
            const tx = await dposInstance.nonIncreaseCommissionRate(
                COMMISSION_RATE,
                LARGER_LOCK_END_TIME,
                { from: CANDIDATE }
            );
            const { event, args } = tx.logs[0];

            assert.equal(event, 'UpdateCommissionRate');
            assert.equal(args.newRate, COMMISSION_RATE);
            assert.equal(args.newLockEndTime, LARGER_LOCK_END_TIME);
        });

        it('should fail to update the rate lock end time to an outdated block number', async () => {
            try {
                await dposInstance.nonIncreaseCommissionRate(
                    COMMISSION_RATE,
                    1,
                    { from: CANDIDATE }
                );
            } catch (error) {
                assert.isAbove(error.message.search('Outdated new lock end time'), -1);
                return;
            }

            assert.fail('should have thrown before');
        });

        it('should fail to decrease the rate lock end time', async () => {
            // increase the lock end time first
            await dposInstance.nonIncreaseCommissionRate(
                COMMISSION_RATE,
                LARGER_LOCK_END_TIME,
                { from: CANDIDATE }
            );

            // get next block
            const block = await web3.eth.getBlock('latest');

            try {
                await dposInstance.nonIncreaseCommissionRate(
                    COMMISSION_RATE,
                    block.number + 10,
                    { from: CANDIDATE }
                );
            } catch (error) {
                assert.isAbove(error.message.search('New lock end time is not increasing'), -1);
                return;
            }

            assert.fail('should have thrown before');
        });

        it('should decrease the commission rate immediately after lock end time', async () => {
            const tx = await dposInstance.nonIncreaseCommissionRate(
                LOWER_RATE,
                LARGER_LOCK_END_TIME,
                { from: CANDIDATE }
            );
            const { event, args } = tx.logs[0];

            assert.equal(event, 'UpdateCommissionRate');
            assert.equal(args.newRate, LOWER_RATE);
            assert.equal(args.newLockEndTime, LARGER_LOCK_END_TIME);
        });

        it('should fail to update the commission rate before lock end time', async () => {
            await dposInstance.nonIncreaseCommissionRate(
                COMMISSION_RATE,
                LARGER_LOCK_END_TIME,
                { from: CANDIDATE }
            );

            try {
                await dposInstance.nonIncreaseCommissionRate(
                    LOWER_RATE,
                    LARGER_LOCK_END_TIME,
                    { from: CANDIDATE }
                );
            } catch (error) {
                assert.isAbove(error.message.search('Commission rate is locked'), -1);
                return;
            }

            assert.fail('should have thrown before');
        });

        it('should announce increase commission rate successfully', async () => {
            const tx = await dposInstance.announceIncreaseCommissionRate(
                HIGHER_RATE,
                LARGER_LOCK_END_TIME,
                { from: CANDIDATE }
            );
            const { event, args } = tx.logs[0];

            assert.equal(event, 'CommissionRateAnnouncement');
            assert.equal(args.candidate, CANDIDATE);
            assert.equal(args.announcedRate, HIGHER_RATE);
            assert.equal(args.announcedLockEndTime, LARGER_LOCK_END_TIME);
        });

        describe('after announceIncreaseCommissionRate', async () => {
            beforeEach(async () => {
                await dposInstance.announceIncreaseCommissionRate(
                    HIGHER_RATE,
                    LARGER_LOCK_END_TIME,
                    { from: CANDIDATE }
                );
            });

            it('should fail to confirmIncreaseCommissionRate before new rate can take effect', async () => {
                try {
                    await dposInstance.confirmIncreaseCommissionRate({ from: CANDIDATE });
                } catch (error) {
                    assert.isAbove(error.message.search('new rate hasn\'t taken effect'), -1);
                    return;
                }

                assert.fail('should have thrown before');
            });

            it('should fail to confirmIncreaseCommissionRate after new rate can take effect but before lock end time', async () => {
                await dposInstance.nonIncreaseCommissionRate(
                    COMMISSION_RATE,
                    LARGER_LOCK_END_TIME,
                    { from: CANDIDATE }
                );

                // need to announceIncreaseCommissionRate again because _updateCommissionRate
                // will remove the previous announcement of increasing commission rate 
                await dposInstance.announceIncreaseCommissionRate(
                    HIGHER_RATE,
                    LARGER_LOCK_END_TIME,
                    { from: CANDIDATE }
                );

                await Timetravel.advanceBlocks(INCREASE_RATE_WAIT_TIME);

                try {
                    await dposInstance.confirmIncreaseCommissionRate({ from: CANDIDATE });
                } catch (error) {
                    console.log(error.message);
                    assert.isAbove(error.message.search('Commission rate is locked'), -1);
                    return;
                }

                assert.fail('should have thrown before');
            });

            it('should confirmIncreaseCommissionRate successfully after new rate takes effect ', async () => {
                await Timetravel.advanceBlocks(INCREASE_RATE_WAIT_TIME);
                const tx = await dposInstance.confirmIncreaseCommissionRate({ from: CANDIDATE });
                const { event, args } = tx.logs[0];

                assert.equal(event, 'UpdateCommissionRate');
                assert.equal(args.newRate, HIGHER_RATE);
                assert.equal(args.newLockEndTime, LARGER_LOCK_END_TIME);
            });
        });

        it('should fail to initialize the same candidate twice', async () => {
            try {
                await dposInstance.initializeCandidate(
                    MIN_SELF_STAKE,
                    COMMISSION_RATE,
                    RATE_LOCK_END_TIME,
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
            const tx = await sgnInstance.updateSidechainAddr(
                newSidechainAddr,
                { from: CANDIDATE }
            );
            const { event, args } = tx.logs[0];

            assert.equal(event, 'UpdateSidechainAddr');
            assert.equal(args.candidate, CANDIDATE);
            assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
            assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
        });

        it('should delegate to candidate by a delegator successfully', async () => {
            await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);

            const tx = await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
            const { event, args } = tx.logs[0];

            assert.equal(event, 'Delegate');
            assert.equal(args.delegator, DELEGATOR);
            assert.equal(args.candidate, CANDIDATE);
            assert.equal(args.newStake, DELEGATOR_STAKE);
            assert.equal(args.stakingPool, DELEGATOR_STAKE);
        });

        it('should fail to claimValidator before delegating enough stake', async () => {
            const stakingPool = MIN_STAKING_POOL - 1;
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
                await celerToken.approve(dposInstance.address, DELEGATOR_STAKE);
                await dposInstance.delegate(CANDIDATE, DELEGATOR_STAKE);
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
                    DELEGATOR_WITHDRAW
                );
                const { event, args } = tx.logs[0];

                assert.equal(event, 'WithdrawFromUnbondedCandidate');
                assert.equal(args.delegator, DELEGATOR);
                assert.equal(args.candidate, CANDIDATE);
                assert.equal(args.amount, DELEGATOR_WITHDRAW);
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

                it('should claimValidator successfully', async () => {
                    const tx = await dposInstance.claimValidator({
                        from: CANDIDATE
                    });
                    const { event, args } = tx.logs[0];

                    assert.equal(event, 'ValidatorChange');
                    assert.equal(args.ethAddr, CANDIDATE);
                    assert.equal(args.changeType, VALIDATOR_ADD);
                });

                describe('after one candidate claimValidator', async () => {
                    beforeEach(async () => {
                        await dposInstance.claimValidator({
                            from: CANDIDATE
                        });
                    });

                    it('should intendWithdraw a small amount by delegator successfully', async () => {
                        const smallAmount = 5;
                        const tx = await dposInstance.intendWithdraw(CANDIDATE, smallAmount);
                        const block = await web3.eth.getBlock('latest');
                        const { event, args } = tx.logs[0];

                        assert.equal(event, 'IntendWithdraw');
                        assert.equal(args.delegator, DELEGATOR);
                        assert.equal(args.candidate, CANDIDATE);
                        assert.equal(args.withdrawAmount.toNumber(), smallAmount);
                        assert.equal(args.proposedTime.toNumber(), block.number);
                    });

                    it('should remove the validator after validator intendWithdraw to an amount under minSelfStake', async () => {
                        const tx = await dposInstance.intendWithdraw(
                            CANDIDATE,
                            CANDIDATE_WITHDRAW_UNDER_MIN,
                            {
                                from: CANDIDATE
                            }
                        );
                        const block = await web3.eth.getBlock('latest');

                        assert.equal(tx.logs[0].event, 'ValidatorChange');
                        assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
                        assert.equal(tx.logs[0].args.changeType, VALIDATOR_REMOVAL);

                        assert.equal(tx.logs[1].event, 'IntendWithdraw');
                        assert.equal(tx.logs[1].args.delegator, CANDIDATE);
                        assert.equal(tx.logs[1].args.candidate, CANDIDATE);
                        assert.equal(
                            tx.logs[1].args.withdrawAmount,
                            CANDIDATE_WITHDRAW_UNDER_MIN
                        );
                        assert.equal(tx.logs[1].args.proposedTime.toNumber(), block.number);
                    });

                    it('should remove the validator after delegator intendWithdraw to an amount under minStakingPool', async () => {
                        const tx = await dposInstance.intendWithdraw(
                            CANDIDATE,
                            DELEGATOR_WITHDRAW
                        );
                        const block = await web3.eth.getBlock('latest');

                        assert.equal(tx.logs[0].event, 'ValidatorChange');
                        assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
                        assert.equal(tx.logs[0].args.changeType, VALIDATOR_REMOVAL);

                        assert.equal(tx.logs[1].event, 'IntendWithdraw');
                        assert.equal(tx.logs[1].args.delegator, DELEGATOR);
                        assert.equal(tx.logs[1].args.candidate, CANDIDATE);
                        assert.equal(tx.logs[1].args.withdrawAmount, DELEGATOR_WITHDRAW);
                        assert.equal(tx.logs[1].args.proposedTime.toNumber(), block.number);
                    });

                    // TODO: add a test of "fail to confirmWithdraw because penalty slashes all undelegating stake"

                    describe('after DPoS goes live', async () => {
                        beforeEach(async () => {
                            await Timetravel.advanceBlocks(DPOS_GO_LIVE_TIMEOUT);
                        });

                        // TODO: use a describe for the following when condition
                        it('should subscribe successfully when there are enough validators', async () => {
                            await celerToken.approve(sgnInstance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            const tx = await sgnInstance.subscribe(SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            const { event, args } = tx.logs[0];

                            assert.equal(event, 'AddSubscriptionBalance');
                            assert.equal(args.consumer, SUBSCRIBER);
                            assert.equal(args.amount, SUB_FEE);
                        });

                        it('should punish successfully', async () => {
                            const oldMiningPool = await dposInstance.miningPool();
                            const oldTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1000000,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE]
                            });
                            const tx = await dposInstance.punish(request);
                            const newMiningPool = await dposInstance.miningPool();
                            const newTokenAmt = await celerToken.balanceOf(SUBSCRIBER);

                            assert.equal(tx.logs[0].event, 'Punish');
                            assert.equal(tx.logs[0].args.validator, CANDIDATE);
                            assert.equal(tx.logs[0].args.delegator, CANDIDATE);
                            assert.equal(tx.logs[0].args.amount, 5);

                            assert.equal(tx.logs[1].event, 'Punish');
                            assert.equal(tx.logs[1].args.validator, CANDIDATE);
                            assert.equal(tx.logs[1].args.delegator, DELEGATOR);
                            assert.equal(tx.logs[1].args.amount, 10);

                            assert.equal(
                                newMiningPool.toNumber(),
                                oldMiningPool.toNumber() + 7
                            );
                            assert.equal(newTokenAmt.toNumber(), oldTokenAmt.toNumber() + 8);
                        });

                        it('should fail to punish with same request twice', async () => {
                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1000000,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE]
                            });
                            await dposInstance.punish(request);

                            try {
                                await dposInstance.punish(request);
                            } catch (error) {
                                assert.isAbove(error.message.search('Used penalty nonce'), -1);
                                return;
                            }

                            assert.fail('should have thrown before');
                        });

                        it('should fail to punish with expired request', async () => {
                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE]
                            });

                            try {
                                await dposInstance.punish(request);
                            } catch (error) {
                                assert.isAbove(error.message.search('Penalty expired'), -1);
                                return;
                            }

                            assert.fail('should have thrown before');
                        });

                        it("should fail to punish if amount sums don't match", async () => {
                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1000000,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [10, 10],
                                signers: [CANDIDATE]
                            });

                            try {
                                await dposInstance.punish(request);
                            } catch (error) {
                                assert.isAbove(
                                    error.message.search("Amount doesn't match"),
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
                            await celerToken.approve(sgnInstance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            await sgnInstance.subscribe(SUB_FEE, {
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
                            assert.equal(tx.logs[0].args.cumulativeMiningReward, miningReward);
                            assert.equal(tx.logs[0].args.serviceReward, serviceReward);
                            assert.equal(tx.logs[0].args.servicePool, SUB_FEE - serviceReward);

                            // TODO: add checks for RedeemMiningReward event (hash is the only way to validate it)
                        });

                        it('should fail to redeem reward more than amount in mining pool', async () => {
                            // contribute to mining pool
                            const contribution = 100;
                            await celerToken.approve(dposInstance.address, contribution);
                            await dposInstance.contributeToMiningPool(contribution);

                            let rewardRequest = await getRewardRequestBytes({
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
                            await celerToken.approve(sgnInstance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            await sgnInstance.subscribe(SUB_FEE, {
                                from: SUBSCRIBER
                            });

                            let rewardRequest = await getRewardRequestBytes({
                                receiver: accounts[9],
                                cumulativeMiningReward: 0,
                                cumulativeServiceReward: SUB_FEE + 1,
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
                            await dposInstance.intendWithdraw(CANDIDATE, DELEGATOR_WITHDRAW);
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
                                await Timetravel.advanceBlocks(BLAME_TIMEOUT);
                            });

                            it('should confirmWithdraw successfully', async () => {
                                const tx = await dposInstance.confirmWithdraw(CANDIDATE);
                                const { event, args } = tx.logs[0];

                                assert.equal(event, 'ConfirmWithdraw');
                                assert.equal(args.delegator, DELEGATOR);
                                assert.equal(args.candidate, CANDIDATE);
                                assert.equal(args.amount, DELEGATOR_WITHDRAW);
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
        const VALIDATORS = [
            accounts[1],
            accounts[2],
            accounts[3],
            accounts[4]
        ];
        const NON_VALIDATOR = accounts[5];

        // validators self delegates 2 * max(MIN_SELF_STAKE, MIN_STAKING_POOL)
        const SELF_STAKE = 2 * Math.max(MIN_SELF_STAKE, MIN_STAKING_POOL);

        beforeEach(async () => {
            for (let i = 0; i < VALIDATORS.length; i++) {
                // validators finish initialization
                const sidechainAddr = sha3(VALIDATORS[i]);
                await dposInstance.initializeCandidate(
                    MIN_SELF_STAKE,
                    COMMISSION_RATE,
                    RATE_LOCK_END_TIME,
                    { from: VALIDATORS[i] }
                );
                await sgnInstance.updateSidechainAddr(
                    sidechainAddr,
                    { from: VALIDATORS[i] }
                );

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

            await Timetravel.advanceBlocks(DPOS_GO_LIVE_TIMEOUT);
        });

        it('should call punish successfully with sufficient delegation', async () => {
            const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [VALIDATORS[0]],
                delegatorAddrs: [VALIDATORS[0]],
                delegatorAmts: [10],
                beneficiaryAddrs: [ZERO_ADDR],
                beneficiaryAmts: [10],
                signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
            });

            const tx = await dposInstance.punish(request);

            assert.equal(tx.logs[0].event, 'Punish');
            assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.amount, 10);
        });

        it('should fail to call punish with duplicate signatures and insufficient delegation', async () => {
            const request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [VALIDATORS[0]],
                delegatorAddrs: [VALIDATORS[0]],
                delegatorAmts: [10],
                beneficiaryAddrs: [ZERO_ADDR],
                beneficiaryAmts: [10],
                signers: [VALIDATORS[1], VALIDATORS[1], VALIDATORS[1], VALIDATORS[1]]
            });

            try {
                await dposInstance.punish(request);
            } catch (error) {
                assert.isAbove(error.message.search('Fail to check validator sigs'), -1);
                return;
            }

            assert.fail('should have thrown before');
        });

        it('should call punish twice successfully with the same group of signers', async () => {
            let request = await getPenaltyRequestBytes({
                nonce: 1,
                expireTime: 1000000,
                validatorAddr: [VALIDATORS[0]],
                delegatorAddrs: [VALIDATORS[0]],
                delegatorAmts: [10],
                beneficiaryAddrs: [ZERO_ADDR],
                beneficiaryAmts: [10],
                signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
            });

            let tx = await dposInstance.punish(request);

            assert.equal(tx.logs[0].event, 'Punish');
            assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.amount, 10);

            request = await getPenaltyRequestBytes({
                nonce: 2,
                expireTime: 1000000,
                validatorAddr: [VALIDATORS[0]],
                delegatorAddrs: [VALIDATORS[0]],
                delegatorAmts: [10],
                beneficiaryAddrs: [ZERO_ADDR],
                beneficiaryAmts: [10],
                signers: [VALIDATORS[1], VALIDATORS[2], VALIDATORS[3]]
            });

            tx = await dposInstance.punish(request);

            assert.equal(tx.logs[0].event, 'Punish');
            assert.equal(tx.logs[0].args.validator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.delegator, VALIDATORS[0]);
            assert.equal(tx.logs[0].args.amount, 10);
        });

        it('should createParamProposal successfully', async () => {
            const newBlameTimeout = BLAME_TIMEOUT + 1;

            await celerToken.approve(dposInstance.address, GOVERN_PROPOSAL_DEPOSIT);
            const tx = await dposInstance.createParamProposal(ENUM_BLAME_TIMEOUT, newBlameTimeout);
            const block = await web3.eth.getBlock('latest');
            const { event, args } = tx.logs[0];

            assert.equal(event, 'CreateParamProposal');
            assert.equal(args.proposalId, 0);
            assert.equal(args.proposer, accounts[0]);
            assert.equal(args.deposit, GOVERN_PROPOSAL_DEPOSIT);
            assert.equal(args.voteDeadline, block.number + GOVERN_VOTE_TIMEOUT);
            assert.equal(args.record, ENUM_BLAME_TIMEOUT);
            assert.equal(args.newValue, newBlameTimeout);
        });

        describe('after someone createParamProposal successfully', async () => {
            const newBlameTimeout = BLAME_TIMEOUT + 1;
            const proposalId = 0;

            beforeEach(async () => {
                await celerToken.approve(dposInstance.address, GOVERN_PROPOSAL_DEPOSIT);
                await dposInstance.createParamProposal(ENUM_BLAME_TIMEOUT, newBlameTimeout);
            });

            it('should fail to voteParam if not validator', async () => {
                try {
                    await dposInstance.voteParam(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: NON_VALIDATOR }
                    );
                } catch (error) {
                    assert.isAbove(error.message.search('msg sender is not a validator'), -1);
                    return;
                }

                assert.fail('should have thrown before');
            });

            it('should fail to voteParam for a proposal with an invalid status', async () => {
                const invalidProposalId = proposalId + 1;
                try {
                    await dposInstance.voteParam(
                        invalidProposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: VALIDATORS[0] }
                    );
                } catch (error) {
                    assert.isAbove(error.message.search('Invalid proposal status'), -1);
                    return;
                }

                assert.fail('should have thrown before');
            });

            it('should vote successfully as a validator', async () => {
                const tx = await dposInstance.voteParam(
                    proposalId,
                    ENUM_VOTE_TYPE_YES,
                    { from: VALIDATORS[0] }
                );
                const { event, args } = tx.logs[0];

                assert.equal(event, 'VoteParam');
                assert.equal(args.proposalId, proposalId);
                assert.equal(args.voter, VALIDATORS[0]);
                assert.equal(args.voteType, ENUM_VOTE_TYPE_YES);
            });

            describe('after a validtor votes successfully', async () => {
                beforeEach(async () => {
                    await dposInstance.voteParam(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: VALIDATORS[0] }
                    );
                });

                it('should fail to vote for the same proposal twice', async () => {
                    try {
                        await dposInstance.voteParam(
                            proposalId,
                            ENUM_VOTE_TYPE_YES,
                            { from: VALIDATORS[0] }
                        );
                    } catch (error) {
                        assert.isAbove(error.message.search('Voter has voted'), -1);
                        return;
                    }

                    assert.fail('should have thrown before');
                });

                it('should vote successfully as another validator', async () => {
                    const tx = await dposInstance.voteParam(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: VALIDATORS[1] }
                    );
                    const { event, args } = tx.logs[0];

                    assert.equal(event, 'VoteParam');
                    assert.equal(args.proposalId, proposalId);
                    assert.equal(args.voter, VALIDATORS[1]);
                    assert.equal(args.voteType, ENUM_VOTE_TYPE_YES);
                });

                it('should fail to confirmParamProposal before the vote deadline', async () => {
                    try {
                        await dposInstance.confirmParamProposal(proposalId);
                    } catch (error) {
                        assert.isAbove(error.message.search('Vote deadline not reached'), -1);
                        return;
                    }

                    assert.fail('should have thrown before');
                });

                describe('after passing the vote deadline', async () => {
                    beforeEach(async () => {
                        await Timetravel.advanceBlocks(GOVERN_VOTE_TIMEOUT);
                    });

                    it('should fail to vote after the vote deadline', async () => {
                        try {
                            await dposInstance.voteParam(
                                proposalId,
                                ENUM_VOTE_TYPE_YES,
                                { from: VALIDATORS[2] }
                            );
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
                        assert.equal(args.record, ENUM_BLAME_TIMEOUT);
                        assert.equal(args.newValue, newBlameTimeout);
                    });
                });
            });

            describe('after over 2/3 voting power votes for Yes', async () => {
                beforeEach(async () => {
                    const majorNum = Math.ceil(VALIDATORS.length * 2 / 3);
                    for (let i = 0; i < majorNum; i++) {
                        await dposInstance.voteParam(
                            proposalId,
                            ENUM_VOTE_TYPE_YES,
                            { from: VALIDATORS[i] }
                        );
                    }
                });

                describe('after passing the vote deadline', async () => {
                    beforeEach(async () => {
                        await Timetravel.advanceBlocks(GOVERN_VOTE_TIMEOUT);
                    });

                    it('should confirmParamProposal (accept proposal case) successfully', async () => {
                        const tx = await dposInstance.confirmParamProposal(proposalId);
                        const { event, args } = tx.logs[0];
                        const queriedNewBlameTimeout = await dposInstance.getUIntValue(ENUM_BLAME_TIMEOUT);

                        assert.equal(event, 'ConfirmParamProposal');
                        assert.equal(args.proposalId, proposalId);
                        assert.equal(args.passed, true);
                        assert.equal(args.record, ENUM_BLAME_TIMEOUT);
                        assert.equal(args.newValue, newBlameTimeout);
                        assert.equal(queriedNewBlameTimeout, newBlameTimeout);
                    });
                });
            });
        });

        // sidechain governance tests
        it('should createSidechainProposal successfully', async () => {
            await celerToken.approve(dposInstance.address, GOVERN_PROPOSAL_DEPOSIT);
            const newRegistrationStatus = true;
            const tx = await dposInstance.createSidechainProposal(ONE_ADDR, newRegistrationStatus);
            const block = await web3.eth.getBlock('latest');
            const { event, args } = tx.logs[0];

            assert.equal(event, 'CreateSidechainProposal');
            assert.equal(args.proposalId, 0);
            assert.equal(args.proposer, accounts[0]);
            assert.equal(args.deposit, GOVERN_PROPOSAL_DEPOSIT);
            assert.equal(args.voteDeadline, block.number + GOVERN_VOTE_TIMEOUT);
            assert.equal(args.sidechainAddr, ONE_ADDR);
            assert.equal(args.registered, newRegistrationStatus);
        });

        describe('after someone createSidechainProposal(register a new sidechain) successfully', async () => {
            const proposalId = 0;
            const newRegistrationStatus = true;

            beforeEach(async () => {
                await celerToken.approve(dposInstance.address, GOVERN_PROPOSAL_DEPOSIT);
                await dposInstance.createSidechainProposal(ONE_ADDR, newRegistrationStatus);
            });

            it('should fail to voteSidechain if not validator', async () => {
                try {
                    await dposInstance.voteSidechain(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: NON_VALIDATOR }
                    );
                } catch (error) {
                    assert.isAbove(error.message.search('msg sender is not a validator'), -1);
                    return;
                }

                assert.fail('should have thrown before');
            });

            it('should fail to voteSidechain for a proposal with an invalid status', async () => {
                const invalidProposalId = proposalId + 1;
                try {
                    await dposInstance.voteSidechain(
                        invalidProposalId,
                        ENUM_VOTE_TYPE_YES,
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
                    ENUM_VOTE_TYPE_YES,
                    { from: VALIDATORS[0] }
                );
                const { event, args } = tx.logs[0];

                assert.equal(event, 'VoteSidechain');
                assert.equal(args.proposalId, proposalId);
                assert.equal(args.voter, VALIDATORS[0]);
                assert.equal(args.voteType, ENUM_VOTE_TYPE_YES);
            });

            describe('after a validtor votes successfully', async () => {
                beforeEach(async () => {
                    await dposInstance.voteSidechain(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: VALIDATORS[0] }
                    );
                });

                it('should fail to vote for the same proposal twice', async () => {
                    try {
                        await dposInstance.voteSidechain(
                            proposalId,
                            ENUM_VOTE_TYPE_YES,
                            { from: VALIDATORS[0] }
                        );
                    } catch (error) {
                        assert.isAbove(error.message.search('Voter has voted'), -1);
                        return;
                    }

                    assert.fail('should have thrown before');
                });

                it('should vote successfully as another validator', async () => {
                    const tx = await dposInstance.voteSidechain(
                        proposalId,
                        ENUM_VOTE_TYPE_YES,
                        { from: VALIDATORS[1] }
                    );
                    const { event, args } = tx.logs[0];

                    assert.equal(event, 'VoteSidechain');
                    assert.equal(args.proposalId, proposalId);
                    assert.equal(args.voter, VALIDATORS[1]);
                    assert.equal(args.voteType, ENUM_VOTE_TYPE_YES);
                });

                it('should fail to confirmSidechainProposal before the vote deadline', async () => {
                    try {
                        await dposInstance.confirmSidechainProposal(proposalId);
                    } catch (error) {
                        assert.isAbove(error.message.search('Vote deadline not reached'), -1);
                        return;
                    }

                    assert.fail('should have thrown before');
                });

                describe('after passing the vote deadline', async () => {
                    beforeEach(async () => {
                        await Timetravel.advanceBlocks(GOVERN_VOTE_TIMEOUT);
                    });

                    it('should fail to vote after the vote deadline', async () => {
                        try {
                            await dposInstance.voteSidechain(
                                proposalId,
                                ENUM_VOTE_TYPE_YES,
                                { from: VALIDATORS[2] }
                            );
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
                        assert.equal(args.sidechainAddr, ONE_ADDR);
                        assert.equal(args.registered, newRegistrationStatus);
                    });
                });
            });

            describe('after over 2/3 voting power votes for Yes', async () => {
                beforeEach(async () => {
                    const majorNum = Math.ceil(VALIDATORS.length * 2 / 3);
                    for (let i = 0; i < majorNum; i++) {
                        await dposInstance.voteSidechain(
                            proposalId,
                            ENUM_VOTE_TYPE_YES,
                            { from: VALIDATORS[i] }
                        );
                    }
                });

                describe('after passing the vote deadline', async () => {
                    beforeEach(async () => {
                        await Timetravel.advanceBlocks(GOVERN_VOTE_TIMEOUT);
                    });

                    it('should confirmSidechainProposal (accept proposal case) successfully', async () => {
                        const tx = await dposInstance.confirmSidechainProposal(proposalId);
                        const { event, args } = tx.logs[0];
                        const queriedRegistrationStatus = await dposInstance.isSidechainRegistered(ONE_ADDR);

                        assert.equal(event, 'ConfirmSidechainProposal');
                        assert.equal(args.proposalId, proposalId);
                        assert.equal(args.passed, true);
                        assert.equal(args.sidechainAddr, ONE_ADDR);
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
                            await celerToken.approve(dposInstance.address, GOVERN_PROPOSAL_DEPOSIT);
                            await dposInstance.createSidechainProposal(ONE_ADDR, registrationStatus);

                            // after over 2/3 voting power votes for Yes
                            const majorNum = Math.ceil(VALIDATORS.length * 2 / 3);
                            for (let i = 0; i < majorNum; i++) {
                                await dposInstance.voteSidechain(
                                    unregisterProposalId,
                                    ENUM_VOTE_TYPE_YES,
                                    { from: VALIDATORS[i] }
                                );
                            }

                            // pass vote deadline
                            await Timetravel.advanceBlocks(GOVERN_VOTE_TIMEOUT);

                            // confirmSidechainProposal
                            const tx = await dposInstance.confirmSidechainProposal(unregisterProposalId);
                            const { event, args } = tx.logs[0];
                            const queriedRegistrationStatus = await dposInstance.isSidechainRegistered(ONE_ADDR);

                            assert.equal(event, 'ConfirmSidechainProposal');
                            assert.equal(args.proposalId, unregisterProposalId);
                            assert.equal(args.passed, true);
                            assert.equal(args.sidechainAddr, ONE_ADDR);
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
            accounts[1],
            accounts[2],
            accounts[3],
            accounts[4],
            accounts[5],
            accounts[6],
            accounts[7],
            accounts[8],
            accounts[9],
            accounts[10],
            accounts[11]
        ];

        // validators self delegates 2 * max(MIN_SELF_STAKE, MIN_STAKING_POOL)
        const SELF_STAKE = 2 * Math.max(MIN_SELF_STAKE, MIN_STAKING_POOL);

        beforeEach(async () => {
            for (let i = 0; i < VALIDATORS.length; i++) {
                // validators finish initialization
                const sidechainAddr = sha3(VALIDATORS[i]);
                await dposInstance.initializeCandidate(
                    MIN_SELF_STAKE,
                    COMMISSION_RATE,
                    RATE_LOCK_END_TIME,
                    { from: VALIDATORS[i] }
                );
                await sgnInstance.updateSidechainAddr(
                    sidechainAddr,
                    { from: VALIDATORS[i] }
                );

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
        });

        it('should getMinQuorumStakingPool successfully', async () => {
            const number = await dposInstance.getValidatorNum();
            const quorumStakingPool = await dposInstance.getMinQuorumStakingPool();

            assert.equal(number.toNumber(), VALIDATORS.length);
            let expectedStakingPool = Math.floor((SELF_STAKE * number * 2) / 3) + 1;
            assert.equal(quorumStakingPool.toNumber(), expectedStakingPool);
        });

        it('should fail to claimValidator with low stake', async () => {
            const addr = accounts[12];

            // validators finish initialization
            const sidechainAddr = sha3(addr);
            await dposInstance.initializeCandidate(
                MIN_SELF_STAKE,
                COMMISSION_RATE,
                RATE_LOCK_END_TIME,
                { from: addr }
            );
            await sgnInstance.updateSidechainAddr(
                sidechainAddr,
                { from: addr }
            );

            await celerToken.approve(dposInstance.address, SELF_STAKE - 1, {
                from: addr
            });
            await dposInstance.delegate(addr, SELF_STAKE - 1, {
                from: addr
            });

            try {
                await dposInstance.claimValidator({
                    from: addr
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
            const addr = accounts[12];

            // validators finish initialization
            const sidechainAddr = sha3(addr);
            await dposInstance.initializeCandidate(
                MIN_SELF_STAKE,
                COMMISSION_RATE,
                RATE_LOCK_END_TIME,
                { from: addr }
            );
            await sgnInstance.updateSidechainAddr(
                sidechainAddr,
                { from: addr }
            );

            await celerToken.approve(dposInstance.address, SELF_STAKE + 1, {
                from: addr
            });
            await dposInstance.delegate(addr, SELF_STAKE + 1, {
                from: addr
            });

            const tx = await dposInstance.claimValidator({ from: addr });

            assert.equal(tx.logs[0].event, 'ValidatorChange');
            assert.equal(tx.logs[0].args.ethAddr, accounts[1]);
            assert.equal(tx.logs[0].args.changeType, VALIDATOR_REMOVAL);
            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, addr);
            assert.equal(tx.logs[1].args.changeType, VALIDATOR_ADD);
        });
    });
});
