import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Button, Card, Skeleton, Statistic, Row, Col } from 'antd';

import { formatCurrencyValue, CELR } from '../utils/unit';
import { CANDIDATE_STATUS } from '../utils/guard';

class Candidate extends React.Component {
  constructor(props, context) {
    super(props);

    this.contracts = context.drizzle.contracts;
    this.state = {
      candidate: null
    };
  }

  static getDerivedStateFromProps(props) {
    const { match, Guard = {} } = props;

    const candidates = _.values(Guard.getCandidateInfo);
    const candidate = _.find(
      candidates,
      candidate => candidate.args[0] === match.params.id
    );

    return { candidate };
  }

  renderAction = () => {
    return [
      <Button onClick={this.takeAction}>Delegate</Button>,
      <Button onClick={this.takeAction}>Withdraw</Button>
    ];
  };

  renderCandidateDetail = () => {
    const { candidate } = this.state;
    const { minSelfStake, stakingPool, status } = candidate.value;
    return (
      <Row style={{ marginTop: '10px' }}>
        <Col span={12}>
          <Statistic title="Address" value={candidate.args[0]} />
        </Col>
        <Col span={12}>
          <Statistic title="Status" value={CANDIDATE_STATUS[status]} />
        </Col>
        <Col span={12}>
          <Statistic
            title="Min Self Stake"
            value={formatCurrencyValue(minSelfStake, CELR)}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Staking Pool"
            value={formatCurrencyValue(stakingPool, CELR)}
          />
        </Col>
      </Row>
    );
  };

  render() {
    const { candidate } = this.state;

    if (!candidate) {
      return <Skeleton />;
    }

    return (
      <Card title="Candidate" extra={this.renderAction()}>
        {this.renderCandidateDetail()}
      </Card>
    );
  }
}

Candidate.propTypes = {
  dispatch: PropTypes.func.isRequired
};

Candidate.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { accounts, contracts, Guard } = state;

  return {
    accounts,
    Guard: { ...Guard, ...contracts.Guard }
  };
}

export default drizzleConnect(Candidate, mapStateToProps);
