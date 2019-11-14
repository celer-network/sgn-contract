import * as React from 'react';
import PropTypes from 'prop-types';
import { drizzleConnect } from 'drizzle-react';
import { withRouter, Link } from 'dva/router';
import { Card, Layout, Menu, Button } from 'antd';
import { AccountData } from 'drizzle-react-components';

import ApproveCELRForm from './components/approve-celr';
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
    const { dispatch } = this.props;
    subscribeEvent(this.contracts);
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
    const { children, location } = this.props;
    const { pathname } = location;

    return (
      <Layout>
        <Sider>
          <Card className="account-data" title="Account info">
            <AccountData accountIndex={0} units={'ether'} />
          </Card>
          <Menu theme="dark" mode="inline" selectedKeys={[pathname.slice(1)]}>
            <Menu.Item key="guard">
              <Link to="/guard">Guard</Link>
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
  const { accounts } = state;

  return {
    accounts
  };
}

export default withRouter(drizzleConnect(App, mapStateToProps));
