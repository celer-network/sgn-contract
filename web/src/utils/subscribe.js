const POLL_INTERVAL = 1000;

export const subscribeEvent = contracts => {
  const { Guard } = contracts;
  console.log(Guard);

  Guard.events.InitializeCandidate(
    {
      fromBlock: 0
    },
    (err, event) => {
      if (err) {
        console.log(err);
        return;
      }

      const { candidate } = event.returnValues;
      Guard.methods.getCandidateInfo.cacheCall(candidate);
    }
  );
};

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
