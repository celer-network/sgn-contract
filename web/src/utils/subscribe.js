const POLL_INTERVAL = 1000;

export const subscribeEvent = (account, contracts, dispatch) => {
    const { DPoS, CELRToken } = contracts;

    DPoS.events.InitializeCandidate(
        {
            fromBlock: 0
        },
        (err, event) => {
            if (err) {
                console.log(err);
                return;
            }

            const { candidate } = event.returnValues;
            DPoS.methods.getCandidateInfo.cacheCall(candidate);
        }
    );

    DPoS.events.CreateParamProposal(
        {
            fromBlock: 0
        },
        (err, event) => {
            if (err) {
                console.log(err);
                return;
            }

            DPoS.methods.paramProposals.cacheCall(
                event.returnValues.proposalId
            );
        }
    );

    CELRToken.events.Approval(
        {
            filter: {
                owner: account,
                spender: DPoS.address
            }
        },
        (err, event) => {
            if (err) {
                return;
            }

            getCelrAllowance(account, contracts);
        }
    );

    getCelrAllowance(account, contracts);
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

const getCelrAllowance = (account, contracts) => {
    const { CELRToken, DPoS } = contracts;
    CELRToken.methods.allowance.cacheCall(account, DPoS.address);
};
