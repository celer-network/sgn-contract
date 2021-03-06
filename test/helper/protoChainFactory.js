const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const sha3 = web3.utils.keccak256;

const protoChainLoader = require('./protoChainLoader');
const {signMessage} = require('./sign');

const utilities = require('./utilities');
const {uint2bytes} = utilities;

// calculate the signature of given address on given hash
const calculateSignature = async (address, hash) => {
  // can't directly use web3.eth.sign() because of this issue:
  // https://github.com/OpenZeppelin/openzeppelin-solidity/pull/1622
  const sigHex = await signMessage(address, hash);
  const sigBytes = web3.utils.hexToBytes(sigHex);
  return sigBytes;
};

const calculateSignatures = async (addresses, hash) => {
  const sigs = [];
  for (let i = 0; i < addresses.length; i++) {
    const sig = await calculateSignature(addresses[i], hash);
    sigs.push(sig);
  }
  return sigs;
};

module.exports = async () => {
  const protoChain = await protoChainLoader();

  const {PenaltyRequest, RewardRequest, Penalty, Reward, AccountAmtPair} = protoChain;

  /** ******** internal API **********/
  // get array of AccountAmtPair proto
  const getAccountAmtPairs = (accounts, amounts) => {
    assert(accounts.length === amounts.length);
    const pairs = [];
    for (let i = 0; i < accounts.length; i++) {
      const pair = {
        account: web3.utils.hexToBytes(accounts[i]),
        amt: uint2bytes(amounts[i])
      };
      const pairProto = AccountAmtPair.create(pair);
      pairs.push(pairProto);
    }
    return pairs;
  };

  /** ******** external API **********/
  const getPenaltyRequestBytes = async ({
    nonce,
    expireTime,
    validatorAddr,
    delegatorAddrs,
    delegatorAmts,
    beneficiaryAddrs,
    beneficiaryAmts,
    signers
  }) => {
    const penalizedDelegators = getAccountAmtPairs(delegatorAddrs, delegatorAmts);
    const beneficiaries = getAccountAmtPairs(beneficiaryAddrs, beneficiaryAmts);

    const penalty = {
      nonce: nonce,
      expireTime: expireTime,
      validatorAddress: web3.utils.hexToBytes(validatorAddr),
      penalizedDelegators: penalizedDelegators,
      beneficiaries: beneficiaries
    };
    const penaltyProto = Penalty.create(penalty);
    const penaltyBytes = Penalty.encode(penaltyProto).finish();

    const penaltyBytesHash = sha3(penaltyBytes);
    const sigs = await calculateSignatures(signers, penaltyBytesHash);
    const penaltyRequest = {
      penalty: penaltyBytes,
      sigs: sigs
    };
    const penaltyRequestProto = PenaltyRequest.create(penaltyRequest);
    const penaltyRequestBytes = PenaltyRequest.encode(penaltyRequestProto).finish();

    return penaltyRequestBytes;
  };

  const getRewardRequestBytes = async ({
    receiver,
    cumulativeMiningReward,
    cumulativeServiceReward,
    signers
  }) => {
    const reward = {
      receiver: web3.utils.hexToBytes(receiver),
      cumulativeMiningReward: uint2bytes(cumulativeMiningReward),
      cumulativeServiceReward: uint2bytes(cumulativeServiceReward)
    };
    const rewardProto = Reward.create(reward);
    const rewardBytes = Reward.encode(rewardProto).finish();

    const rewardBytesHash = sha3(rewardBytes);
    const sigs = await calculateSignatures(signers, rewardBytesHash);
    const rewardRequest = {
      reward: rewardBytes,
      sigs: sigs
    };
    const rewardRequestProto = RewardRequest.create(rewardRequest);
    const rewardRequestBytes = RewardRequest.encode(rewardRequestProto).finish();

    return rewardRequestBytes;
  };

  /** ******** exposed APIs **********/
  return {
    getPenaltyRequestBytes, // async
    getRewardRequestBytes // async
  };
};
