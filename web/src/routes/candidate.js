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
  Icon,
  Tabs,
} from 'antd';

import DelegateForm from '../components/candidate/delegate-form';
import WithdrawForm from '../components/candidate/withdraw-form';
import DelegatorTable from '../components/candidate/delegator-table';
import PunishTable from '../components/candidate/punish-table';
import { formatCelrValue } from '../utils/unit';
import { CANDIDATE_STATUS } from '../utils/dpos';

class Candidate extends React.Component {
  constructor(props, context) {
    super(props);

    this.contracts = context.drizzle.contracts;
    this.state = {
      candidate: null,
      punishes: [],
      isDelegateModalVisible: false,
      isWithdrawModalVisible: false,
    };

    this.contracts.DPoS.events.Delegate(
      {
        fromBlock: 0,
        filter: { candidate: props.match.params.id },
      },
      (err, event) => {
        if (err) {
          return;
        }

        const { delegator, candidate } = event.returnValues;

        this.contracts.DPoS.methods.getDelegatorInfo.cacheCall(
          candidate,
          delegator
        );
      }
    );

    this.contracts.DPoS.events.Punish(
      {
        fromBlock: 0,
        filter: { validator: props.match.params.id },
      },
      (err, event) => {
        if (err) {
          return;
        }

        this.setState({
          punishes: [...this.state.punishes, event.returnValues],
        });
      }
    );
  }

  static getDerivedStateFromProps(props) {
    const { match, DPoS = {} } = props;
    const candidateId = match.params.id;
    const candidates = _.values(DPoS.getCandidateInfo);
    const candidate = _.find(
      candidates,
      (candidate) => candidate.args[0] === candidateId
    );
    const delegators = _.values(DPoS.getDelegatorInfo).filter(
      (delegator) => delegator.args[0] === candidateId
    );

    return { candidate, candidateId, delegators };
  }

  toggleDelegateModal = () => {
    this.setState((prevState) => ({
      isDelegateModalVisible: !prevState.isDelegateModalVisible,
    }));
  };

  toggleWithdrawModal = () => {
    this.setState((prevState) => ({
      isWithdrawModalVisible: !prevState.isWithdrawModalVisible,
    }));
  };

  confirmWithdraw = () => {
    const { candidateId } = this.state;

    this.contracts.DPoS.methods.confirmWithdraw.cacheSend(candidateId);
  };

  renderAction = () => {
    const menu = (
      <Menu>
        <Menu.Item onClick={this.toggleDelegateModal}>Delegate</Menu.Item>
        <Menu.Item onClick={this.toggleWithdrawModal}>
          Initialize Withdraw
        </Menu.Item>
        <Menu.Item onClick={this.confirmWithdraw}>Confirm Withdraw</Menu.Item>
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
    const { candidate, delegators, punishes } = this.state;
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
            value={formatCelrValue(minSelfStake)}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Staking Pool"
            value={formatCelrValue(stakingPool)}
          />
        </Col>
        <Col span={24}>
          <Tabs>
            <Tabs.TabPane tab="Delegators" key="delegators">
              <DelegatorTable delegators={delegators} />
            </Tabs.TabPane>
            <Tabs.TabPane tab="Punishes" key="punishes">
              <PunishTable punishes={punishes} />
            </Tabs.TabPane>
          </Tabs>
        </Col>
      </Row>
    );
  };

  render() {
    const {
      candidate,
      candidateId,
      isDelegateModalVisible,
      isWithdrawModalVisible,
    } = this.state;

    if (!candidate) {
      return <Skeleton />;
    }

    return (
      <Card title="Candidate" extra={this.renderAction()}>
        {this.renderCandidateDetail()}
        <DelegateForm
          candidate={candidateId}
          visible={isDelegateModalVisible}
          onClose={this.toggleDelegateModal}
        />
        <WithdrawForm
          candidate={candidateId}
          visible={isWithdrawModalVisible}
          onClose={this.toggleWithdrawModal}
        />
      </Card>
    );
  }
}

Candidate.propTypes = {
  dispatch: PropTypes.func.isRequired,
};

Candidate.contextTypes = {
  drizzle: PropTypes.object,
};

function mapStateToProps(state) {
  const { contracts, DPoS } = state;

  return {
    DPoS: { ...DPoS, ...contracts.DPoS },
  };
}

export default drizzleConnect(Candidate, mapStateToProps);
