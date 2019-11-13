import Guard from './../contracts/Guard.json';
import ERC20 from './../contracts/ERC20ExampleToken.json';

// let drizzle know what contracts we want
const contractOptions = {
  web3: {
    block: false,
    fallback: {
      type: 'ws',
      url: 'ws://localhost:8545'
    }
  },
  contracts: [Guard, ERC20],
  polls: {
    accounts: 1000,
    blocks: 1000
  }
};

export default contractOptions;
