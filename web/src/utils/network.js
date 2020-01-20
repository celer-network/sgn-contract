import { Modal } from 'antd';
import axios from 'axios';

const MAINNET = '1';
const RINKEBY = '4';

const networkConfigs = {};

const localNetworkConfig = {
  sgnGateway: 'http://44.230.157.100:1317'
};

export const getNetworkConfig = networkID => {
  let networkConfig = localNetworkConfig;
  if (networkConfigs[networkID]) {
    networkConfig = networkConfigs[networkID];
  }

  networkConfig.axiosInstance = axios.create({
    baseURL: networkConfig.sgnGateway,
    timeout: 1000
  });

  return networkConfig;
};

export const checkNetworkCompatbility = () => {
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  const networkVersion = window.web3.currentProvider.networkVersion;
  if (networkVersion !== MAINNET && networkVersion !== RINKEBY) {
    Modal.error({
      title: 'Current network is not supported',
      content: 'Please switch to mainnet or ropsten'
    });
  }
};
