const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');

module.exports = function (deployer, network, accounts) {
  return deployer
    .deploy(ERC20ExampleToken)
    .then(() => {
      return ERC20ExampleToken.deployed();
    })
    .then(token => {
      if (network === 'development') {
        token.transfer(accounts[1], '100000000000000000000000');
      }

      return deployer.deploy(DPoS, ERC20ExampleToken.address, 0, 0, 0, 0, 11);
      // TODO (if needed):
      // 1. deploy sgn contract
      // 2. register sgn address in DPoS contract
    });
};
