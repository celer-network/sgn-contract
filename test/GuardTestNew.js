const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require('./helper/protoChainFactory');
const Timetravel = require('./helper/timetravel');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');
const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');

const GANACHE_ACCOUNT_NUM = 20; // defined in .circleci/config.yml
const ValidatorAdd = 0;
const ValidatorRemoval = 1;
const BLAME_TIMEOUT = 50;
const VALIDATOR_ADD = 0;
const VALIDATOR_REMOVAL = 1;
const MIN_VALIDATOR_NUM = 1;
// need to be larger than CANDIDATE_STAKE for test purpose
const MIN_STAKING_POOL = 80;
const DPOS_GO_LIVE_TIMEOUT = 50;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000';
// value of an indexed null bytes
const HASHED_NULL = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract('DPoS and SGN contract', async accounts => {
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
            BLAME_TIMEOUT,
            MIN_VALIDATOR_NUM,
            MIN_STAKING_POOL,
            DPOS_GO_LIVE_TIMEOUT,
            MAX_VALIDATOR_NUM
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
            { from: CANDIDATE }
        );
        assert.equal(tx.logs[0].event, 'InitializeCandidate');
        assert.equal(tx.logs[0].args.candidate, CANDIDATE);
        assert.equal(tx.logs[0].args.minSelfStake, MIN_SELF_STAKE);

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
                { from: CANDIDATE }
            );
            await sgnInstance.updateSidechainAddr(
                sidechainAddr,
                { from: CANDIDATE }
            );
        });

        it('should fail to initialize the same candidate twice', async () => {
            try {
                await dposInstance.initializeCandidate(
                    MIN_SELF_STAKE,
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

        // validators self delegates 2 * max(MIN_SELF_STAKE, MIN_STAKING_POOL)
        const SELF_STAKE = 2 * Math.max(MIN_SELF_STAKE, MIN_STAKING_POOL);

        beforeEach(async () => {
            for (let i = 0; i < VALIDATORS.length; i++) {
                // validators finish initialization
                const sidechainAddr = sha3(VALIDATORS[i]);
                await dposInstance.initializeCandidate(
                    MIN_SELF_STAKE,
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
            assert.equal(tx.logs[0].args.changeType, ValidatorRemoval);
            assert.equal(tx.logs[1].event, 'ValidatorChange');
            assert.equal(tx.logs[1].args.ethAddr, addr);
            assert.equal(tx.logs[1].args.changeType, ValidatorAdd);
        });
    });
});
