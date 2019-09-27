const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
const sha3 = web3.utils.keccak256;

const protoChainLoader = require("./protoChainLoader");
const { signMessage } = require("./sign");

const utilities = require("./utilities");
const { uint2bytes } = utilities;

// calculate the signature of given address on given hash
const calculateSignature = async (address, hash) => {
    // can't directly use web3.eth.sign() because of this issue:
    // https://github.com/OpenZeppelin/openzeppelin-solidity/pull/1622
    const sigHex = await signMessage(address, hash);
    const sigBytes = web3.utils.hexToBytes(sigHex);
    return sigBytes;
};

const calculateSignatures = async (addresses, hash) => {
    let sigs = [];
    for (let i = 0; i < addresses.length; i++) {
        const sig = await calculateSignature(addresses[i], hash);
        sigs.push(sig);
    }
    return sigs;
}

module.exports = async () => {
    const protoChain = await protoChainLoader();

    const {
        PenaltyRequest,
        PenaltyInfo,
        Penalty,
        AccountAmtPair
    } = protoChain;

    /********** internal API **********/
    // get array of AccountAmtPair proto
    const getAccountAmtPairs = (
        accounts,
        amounts,
    ) => {
        assert(accounts.length == amounts.length);
        let pairs = [];
        for (let i = 0; i < accounts.length; i++) {
            let pair = {
                account: web3.utils.hexToBytes(accounts[i]),
                amt: uint2bytes(amounts[i])
            };
            pairProto = AccountAmtPair.create(pair);
            pairs.push(pairProto);
        }
        return pairs;
    }

    /********** external API **********/
    const getPenaltyRequestBytes = async ({
        nonce,
        expireTime,
        validatorAddr,
        delegatorAddrs,
        delegatorAmts,
        beneficiaryAddrs,
        beneficiaryAmts,
        signers,
    }) => {
        const penalizedDelegators = getAccountAmtPairs(delegatorAddrs, delegatorAmts);
        const beneficiaries = getAccountAmtPairs(beneficiaryAddrs, beneficiaryAmts);

        const penalty = {
            nonce: nonce,
            expireTime: expireTime,
            validatorAddress: validatorAddr,
            penalizedDelegators: penalizedDelegators,
            beneficiaries: beneficiaries
        };
        const penaltyProto = Penalty.create(penalty);
        const penaltyBytes = Penalty.encode(penaltyProto)
            .finish()
            .toJSON().data;

        const penaltyBytesHash = sha3(penaltyBytes);
        const sigs = await calculateSignatures(signers, penaltyBytesHash);

        const penaltyRequest = {
            penalty: penaltyBytes,
            sigs: sigs
        }
        const penaltyRequestProto = PenaltyRequest.create(penaltyRequest);
        const penaltyRequestBytes = PenaltyRequest.encode(penaltyRequestProto)
            .finish()
            .toJSON().data;

        return penaltyRequestBytes;
    }

    // exposed APIs
    return {
        getPenaltyRequestBytes // async
    };
}
