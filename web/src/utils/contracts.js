import DPoS from './../contracts/DPoS.json';
import SGN from './../contracts/SGN.json';
import CELRToken from './../contracts/CELRToken.json';

// let drizzle know what contracts we want
const contractOptions = {
    web3: {
        block: false,
        fallback: {
            type: 'ws',
            url: 'ws://localhost:8545'
        }
    },
    contracts: [DPoS, SGN, CELRToken],
    polls: {
        accounts: 1000,
        blocks: 1000
    }
};

export default contractOptions;
