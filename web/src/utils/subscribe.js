const POLL_INTERVAL = 1000;

export const subscribeEvent = (account, contracts, dispatch) => {};

export const subscribeChainInfo = (web3, dispatch) => {
  const account = web3.currentProvider.selectedAddress;
  let blockNumber;

  setInterval(() => {
    if (account !== web3.currentProvider.selectedAddress) {
      window.location.reload();
    }

    return web3.eth.getBlock('latest').then(block => {
      if (block && blockNumber !== block.number) {
        dispatch({
          type: 'network/save',
          payload: { block }
        });
        blockNumber = block.number;
      }
    });
  }, POLL_INTERVAL);
};
