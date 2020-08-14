const CELRToken = artifacts.require('CELRToken');
const DPoS = artifacts.require('DPoS');
const SGN = artifacts.require('SGN');

const governProposalDeposit = '1000000000000000000';
const governVoteTimeout = 2;
const blameTimeout = 0;
const minValidatorNum = 0;
const maxValidatorNum = 10;
const minStakeInPool = '1000000000000000000';
const advanceNoticePeriod = 2;
const dposGoLiveTimeout = 0;

module.exports = function (deployer, network, accounts) {
  return deployer
    .deploy(CELRToken)
    .then(() => {
      return CELRToken.deployed();
    })
    .then((token) => {
      if (network === 'development') {
        token.transfer(accounts[1], '100000000000000000000000');
      }

      return deployer.deploy(
        DPoS,
        CELRToken.address,
        governProposalDeposit,
        governVoteTimeout,
        blameTimeout,
        minValidatorNum,
        maxValidatorNum,
        minStakeInPool,
        advanceNoticePeriod,
        dposGoLiveTimeout
      );
    })
    .then((dpos) => {
      return deployer.deploy(SGN, CELRToken.address, DPoS.address).then(() => {
        dpos.registerSidechain(SGN.address);
      });
    });
};
