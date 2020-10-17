import React from 'react';
import PropTypes from 'prop-types';
import { drizzleConnect } from 'drizzle-react';
import { Statistic, Row, Col, message, Table } from 'antd';
import axios from 'axios';
import web3 from 'web3';

import { formatCelrValue } from '../../utils/unit';

const columns = [
  {
    title: 'Delegator',
    dataIndex: 'delegatorAddr'
  },
  {
    title: 'Delegated Stake',
    dataIndex: 'delegatedStake',
    sorter: (a, b) => {
      return web3.utils.toBN(a.delegatedStake).cmp(web3.utils.toBN(b.delegatedStake));
    },
    sortOrder: 'descend',
    render: text => {
      return formatCelrValue(text);
    }
  }
];

class SidechainInfo extends React.Component {
  constructor(props, context) {
    super(props);

    const {
      candidateId,
      network: { setting }
    } = props;
    this.state = {};

    axios
      .get(`${setting.gateway}/validator/candidate/${candidateId}`)
      .then(res => {
        const { result } = res.data;

        this.setState({
          ...result,
          commissionRate: result.commission_rate,
          stakingPool: result.staking_pool
        });
      })
      .catch(err => {
        console.error(err);

        if (err.response) {
          message.error(err.response.data.error);
          return;
        }

        message.warning('Please config gateway url in setting to load sidechain info correctly');
      });

    axios
      .get(`${setting.gateway}/validator/candidate-delegators/${candidateId}`)
      .then(res => {
        const delegators = res.data.result.map(delegator => ({
          candidateAddr: delegator.candidate_addr,
          delegatedStake: delegator.delegated_stake,
          delegatorAddr: delegator.delegator_addr
        }));
        this.setState({
          delegators
        });
      })
      .catch(err => {
        console.error(err);

        if (err.response) {
          message.error(err.response.data.error);
          return;
        }

        message.warning('Please config gateway url in setting to load sidechain info correctly');
      });
  }

  render() {
    const { commissionRate, stakingPool, delegators, description = {} } = this.state;
    return (
      <Row>
        <Col span={12}>
          <Statistic title="Commission Rate" value={`${commissionRate * 100} %`} />
        </Col>
        <Col span={12}>
          <Statistic title="Staking Pool" value={formatCelrValue(stakingPool)} />
        </Col>
        <Col span={12}>
          <Statistic title="Website" value={description.website || 'N/A'} />
        </Col>
        <Col span={12}>
          <Statistic title="Contact" value={description.security_contact || 'N/A'} />
        </Col>

        <Col span={24}>
          <Table dataSource={delegators} columns={columns} pagination={false} />
        </Col>
      </Row>
    );
  }
}

SidechainInfo.propTypes = {};

SidechainInfo.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { network } = state;

  return {
    network
  };
}

export default drizzleConnect(SidechainInfo, mapStateToProps);
