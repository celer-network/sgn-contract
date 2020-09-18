import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Skeleton, Card, Statistic, Row, Col, Button, message } from 'antd';
import axios from 'axios';

import { formatCelrValue } from '../utils/unit';

class Reward extends React.Component {
  constructor(props, context) {
    super(props);

    const {
      accounts,
      network: { setting }
    } = props;
    this.currentUser = accounts[0];
    this.contracts = context.drizzle.contracts;
    this.state = {};

    this.contracts.SGN.methods.redeemedServiceReward.cacheCall(
      this.currentUser
    );
    this.contracts.DPoS.methods.redeemedMiningReward.cacheCall(
      this.currentUser
    );

    this.gateway = axios.create({
      baseURL: setting.gateway,
      timeout: 1000
    });

    this.gateway
      .get(`/validator/reward/${this.currentUser}`)
      .then(res => {
        const { result } = res.data;
        this.setState({
          miningReward: result.mining_reward,
          serviceReward: result.service_reward
        });
      })
      .catch(err => {
        console.error(err);

        if (err.response) {
          message.error(err.response.data.error);
          return;
        }

        message.warning(
          'Please config gateway url in setting to load sgn reward correctly'
        );
      });
  }

  intendWithdraw = () => {
    this.gateway
      .post('/validator/withdrawReward', {
        eth_addr: this.currentUser
      })
      .then(() => {
        message.success(
          'Success! Please wait a few seconds to trigger redeem.'
        );
      })
      .catch(err => {
        console.error(err);
      });
  };

  redeemReward = () => {
    this.gateway
      .get(`/validator/rewardRequest/${this.currentUser}`)
      .then(res => {
        this.contracts.SGN.methods.redeemReward.cacheSend(
          '0x' + res.data.result
        );
      })
      .catch(err => {
        console.error(err);
      });
  };

  renderActions = () => {
    return [
      <Button type="primary" onClick={this.intendWithdraw}>
        Initialize Redeem
      </Button>,
      <Button type="primary" onClick={this.redeemReward}>
        Redeem Reward
      </Button>
    ];
  };

  render() {
    const { DPoS, SGN } = this.props;
    const { miningReward, serviceReward } = this.state;
    const { redeemedMiningReward } = DPoS;
    const { redeemedServiceReward } = SGN;

    if (_.isEmpty(redeemedServiceReward) || _.isEmpty(redeemedMiningReward)) {
      return <Skeleton />;
    }

    return (
      <Card title="Reward" actions={this.renderActions()}>
        <Row style={{ marginTop: '10px' }}>
          <Col span={12}>
            <Statistic
              title="Cumulative Mining Reward"
              value={formatCelrValue(miningReward, true)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Cumulative Service Reward"
              value={formatCelrValue(serviceReward, true)}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Mining Reward"
              value={formatCelrValue(
                _.values(redeemedMiningReward)[0].value,
                true
              )}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Redeemed Service Reward"
              value={formatCelrValue(
                _.values(redeemedServiceReward)[0].value,
                true
              )}
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
  const { network, accounts, contracts, DPoS, SGN } = state;

  return {
    network,
    accounts,
    DPoS: { ...DPoS, ...contracts.DPoS },
    SGN: { ...SGN, ...contracts.SGN }
  };
}

export default drizzleConnect(Reward, mapStateToProps);
