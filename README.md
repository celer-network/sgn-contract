Mainchain smart sontracts of [Celer state guardian network (SGN)](https://www.celer.network/docs/celercore/)

[![CircleCI](https://circleci.com/gh/celer-network/sgn-contract/tree/master.svg?style=svg)](https://circleci.com/gh/celer-network/sgn-contract/tree/master)

## Test Locally
1. Install node v10: [https://nodejs.org](https://nodejs.org).
2. Go to sgn-contract's root directory. 
3. Install the node dependencies in the local node_modules folder. 
<pre>
npm install
</pre> 
4. Install truffle and ganache-cli (`sudo` permission might be needed). 
<pre>
npm install -g truffle ganache-cli
</pre> 
5. Run ganache-cli
<pre>
ganache-cli --gasLimit 8000000 --accounts 20
</pre>
6. Use truffle to run tests of sgn-contract contracts. 
<pre>
truffle test
</pre> 
