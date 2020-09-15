import * as React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { withRouter, Link } from 'dva/router';
import { Layout, Menu, Button } from 'antd';

import ApproveCELRForm from './components/approve-celr';
import AccountInfo from './components/account-info';
import { subscribeEvent, subscribeChainInfo } from './utils/subscribe';
import { getNetworkConfig } from './utils/network';

import './App.css';

const { Sider, Content, Footer } = Layout;

class App extends React.Component {
  constructor(props, context) {
    super(props);

    this.state = { isModalVisible: false };
    this.contracts = context.drizzle.contracts;
    this.web3 = context.drizzle.web3;
  }

  componentWillMount() {
    const { accounts, dispatch } = this.props;
    subscribeEvent(accounts[0], this.contracts, dispatch);
    subscribeChainInfo(this.web3, dispatch);

    dispatch({
      type: 'network/save',
      payload: getNetworkConfig(this.web3.currentProvider.networkVersion)
    });
  }

  toggleModal = () => {
    this.setState(prevState => ({
      isModalVisible: !prevState.isModalVisible
    }));
  };

  render() {
    const { isModalVisible } = this.state;
    const { children, location, CELRToken } = this.props;
    const { pathname } = location;
    const celerAllowance = _.values(CELRToken.allowance)[0] || {};

    return (
      <Layout>
        <Sider>
          <AccountInfo celrValue={celerAllowance.value} />
          <Menu theme="dark" mode="inline" selectedKeys={[pathname.slice(1)]}>
            <Menu.Item key="dpos">
              <Link to="/dpos">Validators</Link>
            </Menu.Item>
            {/* <Menu.Item key="govern">
                            <Link to="/govern">Govern</Link>
                        </Menu.Item> */}
            <Menu.Item key="reward">
              <Link to="/reward">Reward</Link>
            </Menu.Item>
            <Menu.Item className="approve-celr">
              <Button type="primary" block onClick={this.toggleModal}>
                Approve CELR
              </Button>
            </Menu.Item>
          </Menu>
        </Sider>
        <Layout>
          <Content>
            {children}
            <ApproveCELRForm
              visible={isModalVisible}
              onClose={this.toggleModal}
            />
          </Content>
          <Footer style={{ textAlign: 'center' }}>
            Sgn ©2019 Created by Celer Network
          </Footer>
        </Layout>
      </Layout>
    );
  }
}

App.propTypes = {
  children: PropTypes.element.isRequired,
  location: PropTypes.object.isRequired
};

App.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { accounts, contracts } = state;

  return {
    accounts,
    CELRToken: contracts.CELRToken
  };
}

export default withRouter(drizzleConnect(App, mapStateToProps));
