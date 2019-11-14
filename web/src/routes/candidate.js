import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import {
  Card,
  Skeleton,
  Statistic,
  Row,
  Col,
  Menu,
  Dropdown,
  Icon
} from 'antd';

import DelegateForm from '../components/candidate/delegate-form';
import DelegatorTable from '../components/candidate/delegator-table';
import { formatCurrencyValue, CELR } from '../utils/unit';
import { CANDIDATE_STATUS } from '../utils/guard';

class Candidate extends React.Component {
  constructor(props, context) {
    super(props);

    this.contracts = context.drizzle.contracts;
    this.state = {
      candidate: null,
      isDelegateModalVisible: false
    };

    this.contracts.Guard.events.Delegate(
      {
        fromBlock: 0,
        filter: { candidate: props.match.params.id }
      },
      (err, event) => {
        if (err) {
          return;
        }

        const { delegator, candidate } = event.returnValues;
        this.contracts.Guard.methods.getDelegatorInfo.cacheCall(
          delegator,
          candidate
        );
      }
    );
  }

  static getDerivedStateFromProps(props) {
    const { match, Guard = {} } = props;
    const candidateId = match.params.id;
    const candidates = _.values(Guard.getCandidateInfo);
    const candidate = _.find(
      candidates,
      candidate => candidate.args[0] === candidateId
    );
    const delegators = _.values(Guard.getDelegatorInfo).filter(
      delegator => delegator.args[1] === candidateId
    );

    return { candidate, delegators };
  }

  toggleDelegateModal = () => {
    this.setState(prevState => ({
      isDelegateModalVisible: !prevState.isDelegateModalVisible
    }));
  };

  renderAction = () => {
    const menu = (
      <Menu>
        <Menu.Item onClick={this.toggleDelegateModal}>Delegate</Menu.Item>
        <Menu.Item>Intend Withdraw</Menu.Item>
        <Menu.Item>Confirm Withdraw</Menu.Item>
      </Menu>
    );

    return (
      <Dropdown overlay={menu}>
        <a className="ant-dropdown-link">
          Actions <Icon type="down" />
        </a>
      </Dropdown>
    );
  };

  renderCandidateDetail = () => {
    const { candidate, delegators } = this.state;
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
        <Col span={24}>
          <DelegatorTable delegators={delegators} />
        </Col>
      </Row>
    );
  };

  render() {
    const { candidate, isDelegateModalVisible } = this.state;

    if (!candidate) {
      return <Skeleton />;
    }

    return (
      <Card title="Candidate" extra={this.renderAction()}>
        {this.renderCandidateDetail()}
        <DelegateForm
          candidate={candidate.args[0]}
          visible={isDelegateModalVisible}
          onClose={this.toggleDelegateModal}
        />
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
