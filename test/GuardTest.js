const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const Timetravel = require("./helper/timetravel")
const Guard = artifacts.require("Guard");
const ERC20ExampleToken = artifacts.require("ERC20ExampleToken");

// use beforeEach method to set up an isolated test environment for each unite test,
// and therefore make all tests independent from each other.
contract("Guard tests", async accounts => {
    const FEE_PER_BLOCK = 10;
    const ONE_DAY = 3600 * 24;
    const WITHDRAW_TIMEOUT = 21 * ONE_DAY;
    const MIN_VALIDATOR_NUM = 4;
    const ValidatorAdd = 0;
    const ValidatorRemoval = 1;

    let celerToken;
    let instance;

    beforeEach(async () => {
        celerToken = await ERC20ExampleToken.new();
        instance = await Guard.new(
            celerToken.address,
            FEE_PER_BLOCK,
            WITHDRAW_TIMEOUT,
            MIN_VALIDATOR_NUM
        );

        // give money to all accounts
        for (let i = 1; i < 10; i++) {
            await celerToken.transfer(accounts[i], 1000000);
        }
    });

    it("should fail to delegate to an uninitialized candidate", async () => {
        await celerToken.approve(instance.address, 100);

        try {
            await instance.delegate(accounts[1], 100);
        } catch (error) {
            assert.isAbove(
                error.message.search("Candidate is not initialized"),
                -1
            );
            return;
        }

        assert.fail("should have thrown before");
    });

    it("should initialize a candidate successfully", async () => {
        await celerToken.approve(instance.address, 100, {
            from: accounts[1]
        });

        const sidechainAddr = sha3(accounts[1]);
        const tx = await instance.initializeCandidate(100, sidechainAddr, {
            from: accounts[1]
        });
        const { event, args } = tx.logs[0];

        assert.equal(event, "InitializeCandidate");
        assert.equal(args.candidate, accounts[1]);
        assert.equal(args.minSelfStake, 100);
        // sidechainAddr is indexed (i.e. hashed)
        assert.equal(args.sidechainAddr, sha3(sidechainAddr));
    });

    describe("after candidate finishes initialization", async () => {
        const candidate = accounts[1];
        const sidechainAddr = sha3(candidate);

        beforeEach(async () => {
            await instance.initializeCandidate(100, sidechainAddr, {
                from: candidate
            });
        });

        it("should fail to initialize candidate twice", async () => {
            await celerToken.approve(instance.address, 100, {
                from: candidate
            });

            try {
                await instance.initializeCandidate(100, sidechainAddr, {
                    from: candidate
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
            const newSidechainAddr = sha3(candidate + "new");
            const tx = await instance.updateSidechainAddr(newSidechainAddr, {
                from: candidate
            });
            const { event, args } = tx.logs[0];

            assert.equal(event, "UpdateSidechainAddr");
            assert.equal(args.candidate, candidate);
            assert.equal(args.oldSidechainAddr, sha3(sidechainAddr));
            assert.equal(args.newSidechainAddr, sha3(newSidechainAddr));
        });

        it("should delegate to candidate by a delegator successfully", async () => {
            await celerToken.approve(instance.address, 100);

            const tx = await instance.delegate(candidate, 100);
            const { event, args } = tx.logs[0];

            assert.equal(event, "Delegate");
            assert.equal(args.delegator, accounts[0]);
            assert.equal(args.candidate, candidate);
            assert.equal(args.newStake, 100);
            assert.equal(args.totalLockedStake, 100);
        });

        it("should fail to claim validator before self delegating minSelfStake", async () => {
            try {
                await instance.claimValidator({
                    from: candidate
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

        describe("after delegator delegates to the candidate", async () => {
            beforeEach(async () => {
                await celerToken.approve(instance.address, 100);
                await instance.delegate(candidate, 100);
            });

            it("should intendWithdraw by delegator successfully", async () => {
                const tx = await instance.intendWithdraw(candidate, 50);
                const block = await web3.eth.getBlock("latest");
                const { event, args } = tx.logs[0];

                assert.equal(event, "IntendWithdraw");
                assert.equal(args.delegator, accounts[0]);
                assert.equal(args.candidate, candidate);
                assert.equal(args.withdrawAmount, 50);
                assert.equal(args.unlockTime.toString(), block.timestamp + WITHDRAW_TIMEOUT);
                assert.equal(args.totalLockedStake, 50);
            });

            describe("after a delegator intendWithdraw", async () => {
                beforeEach(async () => {
                    await instance.intendWithdraw(candidate, 50);
                });

                it("should confirmWithdraw 0 before withdrawTimeout", async () => {
                    const tx = await instance.confirmWithdraw(candidate);
                    const { event, args } = tx.logs[0];

                    assert.equal(event, "ConfirmWithdraw");
                    assert.equal(args.delegator, accounts[0]);
                    assert.equal(args.candidate, candidate);
                    assert.equal(args.amount, 0);
                });

                describe("after withdrawTimeout", async () => {
                    beforeEach(async () => {
                        await Timetravel.advanceTime(WITHDRAW_TIMEOUT + 1);
                    })

                    it("should confirmWithdraw successfully", async () => {
                        const tx = await instance.confirmWithdraw(candidate);
                        const { event, args } = tx.logs[0];

                        assert.equal(event, "ConfirmWithdraw");
                        assert.equal(args.delegator, accounts[0]);
                        assert.equal(args.candidate, candidate);
                        assert.equal(args.amount, 50);
                    });
                });
            });
        });

        describe("after candidate self delegates minSelfStake", async () => {
            beforeEach(async () => {
                await celerToken.approve(instance.address, 100, {
                    from: candidate
                });
                await instance.delegate(candidate, 100, {
                    from: candidate
                });
            });

            it("should claim validator successfully", async () => {
                const tx = await instance.claimValidator({
                    from: candidate
                });
                const { event, args } = tx.logs[0];

                assert.equal(event, "ValidatorChange");
                assert.equal(args.ethAddr, candidate);
                assert.equal(args.changeType, ValidatorAdd);
            });

            describe("after candidate claim validator", async () => {
                beforeEach(async () => {
                    await instance.claimValidator({
                        from: candidate
                    });
                });

                it("should remove the validator after the validator withdraws under minSelfStake", async () => {
                    const tx = await instance.intendWithdraw(candidate, 50, {
                        from: candidate
                    });
                    const block = await web3.eth.getBlock("latest");

                    assert.equal(tx.logs[0].event, "ValidatorChange");
                    assert.equal(tx.logs[0].args.ethAddr, candidate);
                    assert.equal(tx.logs[0].args.changeType, ValidatorRemoval);

                    assert.equal(tx.logs[1].event, "IntendWithdraw");
                    assert.equal(tx.logs[1].args.delegator, candidate);
                    assert.equal(tx.logs[1].args.candidate, candidate);
                    assert.equal(tx.logs[1].args.withdrawAmount, 50);
                    assert.equal(tx.logs[1].args.unlockTime.toString(), block.timestamp + WITHDRAW_TIMEOUT);
                    assert.equal(tx.logs[1].args.totalLockedStake, 50);
                });
            });
        });
    });
});
