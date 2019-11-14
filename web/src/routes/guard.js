import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Link } from 'dva/router';
import { Button, Card, List, Statistic, Row, Col, Icon } from 'antd';

import CandidateForm from '../components/guard/candidate-form';
import { CANDIDATE_STATUS } from '../utils/guard';
import { formatCurrencyValue } from '../utils/unit';
import { CELR } from '../utils/constant';

class Guard extends React.Component {
  constructor(props, context) {
    super(props);

    this.state = { isCandidateModalVisible: false };
    this.contracts = context.drizzle.contracts;
  }

  toggleCandidateModal = () => {
    this.setState(prevState => ({
      isCandidateModalVisible: !prevState.isCandidateModalVisible
    }));
  };

  renderCandidate = candidate => {
    const { minSelfStake, stakingPool, status } = candidate.value;

    return (
      <List.Item>
        <Card
          actions={[
            <Link to={`/candidate/${candidate.args[0]}`}>
              <Icon type="eye" title="View Detail" />
            </Link>
          ]}
        >
          <Row>
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
        </Card>
      </List.Item>
    );
  };

  renderCandidates = () => {
    const { Guard } = this.props;
    const data = _.values(Guard.getCandidateInfo);
    // console.log(Guard);
    return (
      <List
        grid={{ gutter: 16, column: 3 }}
        dataSource={data}
        renderItem={this.renderCandidate}
      />
    );
  };

  render() {
    const { isCandidateModalVisible } = this.state;

    return (
      <Card
        title="Guard"
        extra={
          <Button type="primary" onClick={this.toggleCandidateModal}>
            Initialize Candidate
          </Button>
        }
      >
        {this.renderCandidates()}
        <CandidateForm
          visible={isCandidateModalVisible}
          onClose={this.toggleCandidateModal}
        />
      </Card>
    );
  }
}

Guard.propTypes = {
  dispatch: PropTypes.func.isRequired
};

Guard.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { contracts, Guard } = state;

  return {
    Guard: { ...Guard, ...contracts.Guard }
  };
}

export default drizzleConnect(Guard, mapStateToProps);
