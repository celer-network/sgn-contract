const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
const sha3 = web3.utils.keccak256;

const protoChainFactory = require("./helper/protoChainFactory");
const Timetravel = require("./helper/timetravel")
const Guard = artifacts.require("Guard");
const ERC20ExampleToken = artifacts.require("ERC20ExampleToken");

const BLAME_TIMEOUT = 50;
const VALIDATOR_ADD = 0;
const VALIDATOR_REMOVAL = 1;
const MIN_VALIDATOR_NUM = 1;
// need to be larger than CANDIDATE_STAKE for test purpose
const MIN_TOTAL_STAKE = 80;
const SIDECHAIN_GO_LIVE_TIMEOUT = 50;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract("SGN Guard contract", async accounts => {
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

    let celerToken;
    let instance;
    let getRewardRequestBytes;
    let getPenaltyRequestBytes;

    before(async () => {
        const protoChainInstance = await protoChainFactory();
        getRewardRequestBytes = protoChainInstance.getRewardRequestBytes;
        getPenaltyRequestBytes = protoChainInstance.getPenaltyRequestBytes;
    });

    beforeEach(async () => {
        celerToken = await ERC20ExampleToken.new();

        instance = await Guard.new(
            celerToken.address,
            BLAME_TIMEOUT,
            MIN_VALIDATOR_NUM,
            MIN_TOTAL_STAKE,
            SIDECHAIN_GO_LIVE_TIMEOUT
        );

        // give enough money to other accounts
        for (let i = 1; i < 9; i++) {
            await celerToken.transfer(accounts[i], 10000000);
        }
    });

    it("should fail to delegate to an uninitialized candidate", async () => {
        await celerToken.approve(instance.address, DELEGATOR_STAKE);

        try {
            await instance.delegate(CANDIDATE, DELEGATOR_STAKE);
        } catch (error) {
            assert.isAbove(
                error.message.search("Candidate is not initialized"),
                -1
            );
            return;
        }

        assert.fail("should have thrown before");
    });

    it("should fail to subscribe before sidechain goes live", async () => {
        await celerToken.approve(instance.address, SUB_FEE, {
            from: SUBSCRIBER
        });

        try {
            await instance.subscribe(SUB_FEE, {
                from: SUBSCRIBER
            });
        } catch (error) {
            assert.isAbove(
                error.message.search("Sidechain is not live"),
                -1
            );
            return;
        }

        assert.fail("should have thrown before");
    });

    it("should fail to subscribe before there are enough validators", async () => {
        await Timetravel.advanceBlocks(SIDECHAIN_GO_LIVE_TIMEOUT);
        await celerToken.approve(instance.address, SUB_FEE, {
            from: SUBSCRIBER
        });

        try {
            await instance.subscribe(SUB_FEE, {
                from: SUBSCRIBER
            });
        } catch (error) {
            assert.isAbove(
                error.message.search("Too few validators"),
                -1
            );
            return;
        }

        assert.fail("should have thrown before");
    });

    it("should initialize a candidate successfully", async () => {
        const sidechainAddr = sha3(CANDIDATE);
        const tx = await instance.initializeCandidate(MIN_SELF_STAKE, sidechainAddr, {
            from: CANDIDATE
        });
        const { event, args } = tx.logs[0];

        assert.equal(event, "InitializeCandidate");
        assert.equal(args.candidate, CANDIDATE);
        assert.equal(args.minSelfStake, MIN_SELF_STAKE);
        // sidechainAddr is indexed (i.e. hashed)
        assert.equal(args.sidechainAddr, sha3(sidechainAddr));
    });

    describe("after one candidate finishes initialization", async () => {
        const sidechainAddr = sha3(CANDIDATE);

        beforeEach(async () => {
            await instance.initializeCandidate(MIN_SELF_STAKE, sidechainAddr, {
                from: CANDIDATE
            });
        });

        it("should fail to initialize the same candidate twice", async () => {
            try {
                await instance.initializeCandidate(MIN_SELF_STAKE, sidechainAddr, {
                    from: CANDIDATE
                });
            } catch (error) {
                assert.isAbove(
                    error.message.search("Candidate is initialized"),
                    -1
                );
                return;
            }

            assert.fail("should have thrown before");
        });

        it("should update sidechain address by candidate successfully", async () => {
            const newSidechainAddr = sha3(CANDIDATE + "new");
            const tx = await instance.updateSidechainAddr(newSidechainAddr, {
                from: CANDIDATE
            });
            const { event, args } = tx.logs[0];

            assert.equal(event, "UpdateSidechainAddr");
            assert.equal(args.candidate, CANDIDATE);
            assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
            assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
        });

        it("should delegate to candidate by a delegator successfully", async () => {
            await celerToken.approve(instance.address, DELEGATOR_STAKE);

            const tx = await instance.delegate(CANDIDATE, DELEGATOR_STAKE);
            const { event, args } = tx.logs[0];

            assert.equal(event, "Delegate");
            assert.equal(args.delegator, DELEGATOR);
            assert.equal(args.candidate, CANDIDATE);
            assert.equal(args.newStake, DELEGATOR_STAKE);
            assert.equal(args.totalStake, DELEGATOR_STAKE);
        });

        it("should fail to claimValidator before delegating enough stake", async () => {
            const delegation = MIN_TOTAL_STAKE - 1;
            await celerToken.approve(instance.address, delegation);
            await instance.delegate(CANDIDATE, delegation);

            try {
                await instance.claimValidator({
                    from: CANDIDATE
                });
            } catch (error) {
                assert.isAbove(
                    error.message.search("Not enough total stake"),
                    -1
                );
                return;
            }

            assert.fail("should have thrown before");
        });

        it("should contribute to mining pool successfully", async () => {
            const contribution = 100;
            await celerToken.approve(instance.address, contribution);
            const tx = await instance.contributeToMiningPool(contribution);
            const { event, args } = tx.logs[0];

            assert.equal(event, "MiningPoolContribution");
            assert.equal(args.contributor, accounts[0]);
            assert.equal(args.contribution, contribution);
            // previous miningPoolSize is 0
            assert.equal(args.miningPoolSize, contribution);
        });

        describe("after one delegator delegates enough stake to the candidate", async () => {
            beforeEach(async () => {
                await celerToken.approve(instance.address, DELEGATOR_STAKE);
                await instance.delegate(CANDIDATE, DELEGATOR_STAKE);
            });

            it("should fail to claimValidator before self delegating minSelfStake", async () => {
                try {
                    await instance.claimValidator({
                        from: CANDIDATE
                    });
                } catch (error) {
                    assert.isAbove(
                        error.message.search("Not enough self stake"),
                        -1
                    );
                    return;
                }

                assert.fail("should have thrown before");
            });

            it("should withdrawFromUnbondedCandidate by delegator successfully", async () => {
                const tx = await instance.withdrawFromUnbondedCandidate(CANDIDATE, DELEGATOR_WITHDRAW);
                const { event, args } = tx.logs[0];

                assert.equal(event, "WithdrawFromUnbondedCandidate");
                assert.equal(args.delegator, DELEGATOR);
                assert.equal(args.candidate, CANDIDATE);
                assert.equal(args.amount, DELEGATOR_WITHDRAW);
            });

            describe("after one candidate self delegates minSelfStake", async () => {
                beforeEach(async () => {
                    await celerToken.approve(instance.address, CANDIDATE_STAKE, {
                        from: CANDIDATE
                    });
                    await instance.delegate(CANDIDATE, CANDIDATE_STAKE, {
                        from: CANDIDATE
                    });
                });

                it("should claimValidator successfully", async () => {
                    const tx = await instance.claimValidator({
                        from: CANDIDATE
                    });
                    const { event, args } = tx.logs[0];

                    assert.equal(event, "ValidatorChange");
                    assert.equal(args.ethAddr, CANDIDATE);
                    assert.equal(args.changeType, VALIDATOR_ADD);
                });

                describe("after one candidate claimValidator", async () => {
                    beforeEach(async () => {
                        await instance.claimValidator({
                            from: CANDIDATE
                        });
                    });

                    it("should intendWithdraw a small amount by delegator successfully", async () => {
                        const smallAmount = 5;
                        const tx = await instance.intendWithdraw(CANDIDATE, smallAmount);
                        const block = await web3.eth.getBlock("latest");
                        const { event, args } = tx.logs[0];

                        assert.equal(event, "IntendWithdraw");
                        assert.equal(args.delegator, DELEGATOR);
                        assert.equal(args.candidate, CANDIDATE);
                        assert.equal(args.withdrawAmount.toNumber(), smallAmount);
                        assert.equal(args.intendTime.toNumber(), block.number);
                    });

                    it("should remove the validator after validator intendWithdraw to an amount under minSelfStake", async () => {
                        const tx = await instance.intendWithdraw(CANDIDATE, CANDIDATE_WITHDRAW_UNDER_MIN, {
                            from: CANDIDATE
                        });
                        const block = await web3.eth.getBlock("latest");

                        assert.equal(tx.logs[0].event, "ValidatorChange");
                        assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
                        assert.equal(tx.logs[0].args.changeType, VALIDATOR_REMOVAL);

                        assert.equal(tx.logs[1].event, "IntendWithdraw");
                        assert.equal(tx.logs[1].args.delegator, CANDIDATE);
                        assert.equal(tx.logs[1].args.candidate, CANDIDATE);
                        assert.equal(tx.logs[1].args.withdrawAmount, CANDIDATE_WITHDRAW_UNDER_MIN);
                        assert.equal(tx.logs[1].args.intendTime.toNumber(), block.number);
                    });

                    it("should remove the validator after delegator intendWithdraw to an amount under minTotalStake", async () => {
                        const tx = await instance.intendWithdraw(CANDIDATE, DELEGATOR_WITHDRAW);
                        const block = await web3.eth.getBlock("latest");

                        assert.equal(tx.logs[0].event, "ValidatorChange");
                        assert.equal(tx.logs[0].args.ethAddr, CANDIDATE);
                        assert.equal(tx.logs[0].args.changeType, VALIDATOR_REMOVAL);

                        assert.equal(tx.logs[1].event, "IntendWithdraw");
                        assert.equal(tx.logs[1].args.delegator, DELEGATOR);
                        assert.equal(tx.logs[1].args.candidate, CANDIDATE);
                        assert.equal(tx.logs[1].args.withdrawAmount, DELEGATOR_WITHDRAW);
                        assert.equal(tx.logs[1].args.intendTime.toNumber(), block.number);
                    });

                    // TODO: add a test of "fail to confirmWithdraw because penalty slashes all undelegating stake"

                    describe("after sidechain goes live", async () => {
                        beforeEach(async () => {
                            await Timetravel.advanceBlocks(SIDECHAIN_GO_LIVE_TIMEOUT);
                        })

                        // TODO: use a describe for the following when condition
                        it("should subscribe successfully when there are enough validators", async () => {
                            await celerToken.approve(instance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            const tx = await instance.subscribe(SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            const { event, args } = tx.logs[0];

                            assert.equal(event, "AddSubscriptionBalance");
                            assert.equal(args.consumer, SUBSCRIBER);
                            assert.equal(args.amount, SUB_FEE);
                        });

                        it("should punish successfully", async () => {
                            const oldMiningPool = await instance.miningPool().toNumber();
                            const oldTokenAmt = await celerToken.balanceOf(SUBSCRIBER).toNumber();

                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1000000,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE],
                            });
                            const tx = await instance.punish(request);
                            const newMiningPool = await instance.miningPool().toNumber();
                            const newTokenAmt = await celerToken.balanceOf(SUBSCRIBER).toNumber();


                            assert.equal(tx.logs[0].event, "Punish");
                            assert.equal(tx.logs[0].args.validator, CANDIDATE);
                            assert.equal(tx.logs[0].args.delegator, CANDIDATE);
                            assert.equal(tx.logs[0].args.amount, 5);

                            assert.equal(tx.logs[1].event, "Punish");
                            assert.equal(tx.logs[1].args.validator, CANDIDATE);
                            assert.equal(tx.logs[1].args.delegator, DELEGATOR);
                            assert.equal(tx.logs[1].args.amount, 10);

                            assert.equal(newMiningPool, oldMiningPool + 7);
                            assert.equal(newTokenAmt, oldTokenAmt + 8);
                        });

                        it("should fail to punish with same request twice", async () => {
                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1000000,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE],
                            });
                            await instance.punish(request);

                            try {
                                await instance.punish(request);
                            } catch (error) {
                                assert.isAbove(
                                    error.message.search("Used penalty nonce"),
                                    -1
                                );
                                return;
                            }

                            assert.fail("should have thrown before");
                        });

                        it("should fail to punish with expired request", async () => {
                            const request = await getPenaltyRequestBytes({
                                nonce: 1,
                                expireTime: 1,
                                validatorAddr: [CANDIDATE],
                                delegatorAddrs: [CANDIDATE, DELEGATOR],
                                delegatorAmts: [5, 10],
                                beneficiaryAddrs: [ZERO_ADDR, SUBSCRIBER],
                                beneficiaryAmts: [7, 8],
                                signers: [CANDIDATE],
                            });

                            try {
                                await instance.punish(request);
                            } catch (error) {
                                assert.isAbove(
                                    error.message.search("Penalty expired"),
                                    -1
                                );
                                return;
                            }

                            assert.fail("should have thrown before");
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
                                signers: [CANDIDATE],
                            });

                            try {
                                await instance.punish(request);
                            } catch (error) {
                                assert.isAbove(
                                    error.message.search("Amount doesn't match"),
                                    -1
                                );
                                return;
                            }

                            assert.fail("should have thrown before");
                        });

                        it("should redeem reward successfully", async () => {
                            // contribute to mining pool
                            const contribution = 100;
                            await celerToken.approve(instance.address, contribution);
                            await instance.contributeToMiningPool(contribution);

                            // submit subscription fees
                            await celerToken.approve(instance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            await instance.subscribe(SUB_FEE, {
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
                            const tx = await instance.redeemReward(rewardRequest);
                            const { event, args } = tx.logs[0];

                            assert.equal(event, "RedeemReward");
                            assert.equal(args.receiver, receiver);
                            assert.equal(args.miningReward, miningReward);
                            assert.equal(args.serviceReward, serviceReward);
                            assert.equal(args.miningPool, contribution - miningReward);
                            assert.equal(args.servicePool, SUB_FEE - serviceReward);
                        });

                        it("should fail to redeem reward more than amount in mining pool", async () => {
                            // contribute to mining pool
                            const contribution = 100;
                            await celerToken.approve(instance.address, contribution);
                            await instance.contributeToMiningPool(contribution);

                            let rewardRequest = await getRewardRequestBytes({
                                receiver: accounts[9],
                                cumulativeMiningReward: contribution + 1,
                                cumulativeServiceReward: 0,
                                signers: [CANDIDATE]
                            });

                            try {
                                await instance.redeemReward(rewardRequest);
                            } catch (error) {
                                return;
                            }

                            assert.fail("should have thrown before");
                        });

                        it("should fail to redeem reward more than amount in service pool", async () => {
                            // submit subscription fees
                            await celerToken.approve(instance.address, SUB_FEE, {
                                from: SUBSCRIBER
                            });
                            await instance.subscribe(SUB_FEE, {
                                from: SUBSCRIBER
                            });

                            let rewardRequest = await getRewardRequestBytes({
                                receiver: accounts[9],
                                cumulativeMiningReward: 0,
                                cumulativeServiceReward: SUB_FEE + 1,
                                signers: [CANDIDATE]
                            });

                            try {
                                await instance.redeemReward(rewardRequest);
                            } catch (error) {
                                return;
                            }

                            assert.fail("should have thrown before");
                        });
                    });

                    describe("after a delegator intendWithdraw", async () => {
                        beforeEach(async () => {
                            await instance.intendWithdraw(CANDIDATE, DELEGATOR_WITHDRAW);
                        });

                        it("should confirmWithdraw 0 before withdrawTimeout", async () => {
                            const tx = await instance.confirmWithdraw(CANDIDATE);
                            const { event, args } = tx.logs[0];

                            assert.equal(event, "ConfirmWithdraw");
                            assert.equal(args.delegator, DELEGATOR);
                            assert.equal(args.candidate, CANDIDATE);
                            assert.equal(args.amount, 0);
                        });

                        describe("after withdrawTimeout", async () => {
                            beforeEach(async () => {
                                await Timetravel.advanceBlocks(BLAME_TIMEOUT);
                            });

                            it("should confirmWithdraw successfully", async () => {
                                const tx = await instance.confirmWithdraw(CANDIDATE);
                                const { event, args } = tx.logs[0];

                                assert.equal(event, "ConfirmWithdraw");
                                assert.equal(args.delegator, DELEGATOR);
                                assert.equal(args.candidate, CANDIDATE);
                                assert.equal(args.amount, DELEGATOR_WITHDRAW);
                            });

                            describe("after confirmWithdraw", async () => {
                                beforeEach(async () => {
                                    await instance.confirmWithdraw(CANDIDATE);
                                });

                                it("should confirmWithdraw 0 after all withdraw intents are cleared", async () => {
                                    const tx = await instance.confirmWithdraw(CANDIDATE);
                                    const { event, args } = tx.logs[0];

                                    assert.equal(event, "ConfirmWithdraw");
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

    describe("after multiple validators join the validator set", async () => {
        const VALIDATORS = [
            accounts[1],
            accounts[2],
            accounts[3],
            accounts[4],
            accounts[5],
            accounts[6],
            accounts[7]
        ];

        beforeEach(async () => {
            for (let i = 0; i < VALIDATORS.length; i++) {
                // validators finish initialization
                const sidechainAddr = sha3(VALIDATORS[i]);
                await instance.initializeCandidate(MIN_SELF_STAKE, sidechainAddr, {
                    from: VALIDATORS[i]
                });

                // validators self delegates max(MIN_SELF_STAKE, MIN_TOTAL_STAKE)
                let amount = Math.max(MIN_SELF_STAKE, MIN_TOTAL_STAKE);
                await celerToken.approve(instance.address, amount, {
                    from: VALIDATORS[i]
                });
                await instance.delegate(VALIDATORS[i], amount, {
                    from: VALIDATORS[i]
                });

                // validators claimValidator
                await instance.claimValidator({
                    from: VALIDATORS[i]
                });
            }
        });

        it("should getMinQuorumSize successfully", async () => {
            const number = await instance.getValidatorNum().toNumber();
            const size = await instance.getMinQuorumSize().toNumber();

            assert.equal(number, 7);
            assert.equal(size, 5);
        });
    });
});
