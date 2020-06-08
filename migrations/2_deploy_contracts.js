const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');

const governProposalDeposit = 1000000000000000000;
const governVoteTimeout = 2;
const blameTimeout = 0;
const minValidatorNum = 0;
const maxValidatorNum = 10;
const minStakeInPool = 1000000000000000000;
const increaseRateWaitTime = 2;
const dposGoLiveTimeout = 0;

module.exports = function (deployer, network, accounts) {
  return deployer
    .deploy(ERC20ExampleToken)
    .then(() => {
      return ERC20ExampleToken.deployed();
    })
    .then((token) => {
      if (network === 'development') {
        token.transfer(accounts[1], '100000000000000000000000');
      }

      return deployer.deploy(
        DPoS,
        ERC20ExampleToken.address,
        governProposalDeposit,
        governVoteTimeout,
        blameTimeout,
        minValidatorNum,
        maxValidatorNum,
        minStakeInPool,
        increaseRateWaitTime,
        dposGoLiveTimeout
      );
    })
    .then((dpos) => {
      return deployer
        .deploy(SGN, ERC20ExampleToken.address, DPoS.address)
        .then(() => {
          dpos.registerSidechain(SGN.address);
        });
    });
};
