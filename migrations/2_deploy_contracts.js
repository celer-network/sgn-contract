const ERC20ExampleToken = artifacts.require('ERC20ExampleToken');
const Guard = artifacts.require('Guard');

module.exports = function(deployer, network, accounts) {
  return deployer
    .deploy(ERC20ExampleToken)
    .then(() => {
      return ERC20ExampleToken.deployed();
    })
    .then(token => {
      if (network === 'development') {
        token.transfer(accounts[1], '100000000000000000000000');
      }

      return deployer.deploy(Guard, ERC20ExampleToken.address, 0, 0, 0, 0);
    });
};
