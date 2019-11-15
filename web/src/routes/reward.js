import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Skeleton, Card, Statistic, Row, Col, Button } from 'antd';

import { formatCelrValue } from '../utils/unit';

class Reward extends React.Component {
  constructor(props, context) {
    super(props);

    const { accounts, network } = props;
    const currentUser = accounts[0];
    this.contracts = context.drizzle.contracts;
    this.state = {};

    this.contracts.Guard.methods.redeemedServiceReward.cacheCall(currentUser);
    this.contracts.Guard.methods.redeemedMiningReward.cacheCall(currentUser);

    network.axiosInstance.get(`/validator/reward/${currentUser}`).then(res => {
      this.setState({
        ...res.data.result
      });
    });
  }

  indendWithdraw = () => {
    const { accounts, network } = this.props;

    network.axiosInstance.post('/validator/withdrawReward', {
      ethAddr: accounts[0]
    });
  };

  redeemReward = () => {
    const { accounts, network } = this.props;

    network.axiosInstance
      .get(`/validator/rewardRequest/${accounts[0]}`)
      .then(res => {
        this.contracts.Guard.methods.redeemReward.cacheSend(res.data.result);
      });
  };

  renderActions = () => {
    return [
      <Button type="primary" onClick={this.indendWithdraw}>
        Intend Redeem
      </Button>,
      <Button type="primary" onClick={this.redeemReward}>
        Redeem Reward
      </Button>
    ];
  };

  render() {
    const { Guard } = this.props;
    const { cumulativeMiningReward, cumulativeServiceReward } = this.state;
    const { redeemedServiceReward, redeemedMiningReward } = Guard;

    if (_.isEmpty(redeemedServiceReward) || _.isEmpty(redeemedMiningReward)) {
      return <Skeleton />;
    }

    return (
      <Card title="Reward" actions={this.renderActions()}>
        <Row style={{ marginTop: '10px' }}>
          <Col span={12}>
            <Statistic
              title="Cumulative Mining Reward"
              value={formatCelrValue(cumulativeMiningReward)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Cumulative Service Reward"
              value={formatCelrValue(cumulativeServiceReward)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Service Reward"
              value={formatCelrValue(_.values(redeemedServiceReward)[0].value)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Mining Reward"
              value={formatCelrValue(_.values(redeemedMiningReward)[0].value)}
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
