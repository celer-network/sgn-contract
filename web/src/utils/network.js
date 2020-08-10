import { Modal } from 'antd';

const MAINNET = '1';
const ROPSTEN = '3';
const RINKEBY = '4';

const networkConfigs = {};

const localNetworkConfig = {};

export const getNetworkConfig = networkID => {
    let networkConfig = localNetworkConfig;
    if (networkConfigs[networkID]) {
        networkConfig = networkConfigs[networkID];
    }

    return networkConfig;
};

export const checkNetworkCompatbility = () => {
    if (process.env.NODE_ENV === 'development') {
        return;
    }

    const networkVersion = window.web3.currentProvider.networkVersion;
    if (networkVersion !== ROPSTEN) {
        Modal.error({
            title: 'Current network is not supported',
            content: 'Please switch to ropsten'
        });
    }
};
