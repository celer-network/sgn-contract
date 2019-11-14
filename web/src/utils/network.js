import { Modal } from 'antd';

const MAINNET = '1';
const ROPSTEN = '3';

const networkConfigs = {};

const localNetworkConfig = {};

export const getNetworkConfig = networkID => {
  if (networkConfigs[networkID]) {
    return networkConfigs[networkID];
  }

  return localNetworkConfig;
};

export const checkNetworkCompatbility = () => {
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  const networkVersion = window.web3.currentProvider.networkVersion;
  if (networkVersion !== MAINNET && networkVersion !== ROPSTEN) {
    Modal.error({
      title: 'Current network is not supported',
      content: 'Please switch to mainnet or ropsten'
    });
  }
};
