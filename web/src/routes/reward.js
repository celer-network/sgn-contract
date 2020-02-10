import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import {
  Skeleton,
  Card,
  Statistic,
  Row,
  Col,
  Button,
  Input,
  message
} from 'antd';
import axios from 'axios';

import { formatCelrValue } from '../utils/unit';

const GATEWAY_KEY = 'gateway';

class Reward extends React.Component {
  constructor(props, context) {
    super(props);

    const { accounts } = props;
    this.currentUser = accounts[0];
    this.contracts = context.drizzle.contracts;
    this.state = {};

    this.contracts.Guard.methods.redeemedServiceReward.cacheCall(
      this.currentUser
    );
    this.contracts.Guard.methods.redeemedMiningReward.cacheCall(
      this.currentUser
    );

    this.setGateway(localStorage.getItem(GATEWAY_KEY));
  }

  setGateway = value => {
    localStorage.setItem(GATEWAY_KEY, value);
    this.gateway = axios.create({
      baseURL: value,
      timeout: 1000
    });

    this.gateway.get(`/validator/reward/${this.currentUser}`).then(res => {
      this.setState({
        ...res.data.result
      });
    });
  };

  indendWithdraw = () => {
    this.gateway
      .post('/validator/withdrawReward', {
        ethAddr: this.currentUser
      })
      .then(() => {
        message.success(
          'Success! Please wait a few seconds to trigger redeem.'
        );
      });
  };

  redeemReward = () => {
    this.gateway
      .get(`/validator/rewardRequest/${this.currentUser}`)
      .then(res => {
        this.contracts.Guard.methods.redeemReward.cacheSend(
          '0x' + res.data.result
        );
      });
  };

  renderGateway = () => {
    return (
      <Input.Search
        defaultValue={this.gateway.defaults.baseURL}
        placeholder="Gateway url"
        enterButton="Save"
        onSearch={this.setGateway}
        style={{ width: 500 }}
      />
    );
  };

  renderActions = () => {
    return [
      <Button type="primary" onClick={this.indendWithdraw}>
        Initialize Redeem
      </Button>,
      <Button type="primary" onClick={this.redeemReward}>
        Redeem Reward
      </Button>
    ];
  };

  render() {
    const { Guard } = this.props;
    const { miningReward, serviceReward } = this.state;
    const { redeemedServiceReward, redeemedMiningReward } = Guard;

    if (_.isEmpty(redeemedServiceReward) || _.isEmpty(redeemedMiningReward)) {
      return <Skeleton />;
    }

    return (
      <Card
        title="Reward"
        actions={this.renderActions()}
        extra={this.renderGateway()}
      >
        <Row style={{ marginTop: '10px' }}>
          <Col span={12}>
            <Statistic
              title="Cumulative Mining Reward"
              value={formatCelrValue(miningReward)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Cumulative Service Reward"
              value={formatCelrValue(serviceReward)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Mining Reward"
              value={formatCelrValue(_.values(redeemedMiningReward)[0].value)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Service Reward"
              value={formatCelrValue(_.values(redeemedServiceReward)[0].value)}
            />
          </Col>
        </Row>
      </Card>
    );
  }
}

Reward.propTypes = {
  dispatch: PropTypes.func.isRequired
};

Reward.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { network, accounts, contracts, Guard } = state;

  return {
    network,
    accounts,
    Guard: { ...Guard, ...contracts.Guard }
  };
}

export default drizzleConnect(Reward, mapStateToProps);
