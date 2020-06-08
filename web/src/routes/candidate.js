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

import SidechainForm from '../components/candidate/sidechain-form';
import DelegateForm from '../components/candidate/delegate-form';
import WithdrawForm from '../components/candidate/withdraw-form';
import CommissionForm from '../components/candidate/commission-form';
import DelegatorTable from '../components/candidate/delegator-table';
import PunishTable from '../components/candidate/punish-table';
import { formatCelrValue } from '../utils/unit';
import { CANDIDATE_STATUS } from '../utils/dpos';
import { RATE_BASE } from '../utils/constant';

class Candidate extends React.Component {
  constructor(props, context) {
    super(props);

    this.contracts = context.drizzle.contracts;
    this.state = {
      candidate: null,
      punishes: [],
      isSidechainModalVisible: false,
      isDelegateModalVisible: false,
      isWithdrawModalVisible: false,
      isCommissionModalVisible: false,
    };

    const candidateId = props.match.params.id;
    this.contracts.SGN.methods.sidechainAddrMap.cacheCall(candidateId);

    this.contracts.DPoS.events.Delegate(
      {
        fromBlock: 0,
        filter: { candidate: candidateId },
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
        filter: { validator: candidateId },
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

  toggleSidechainModal = () => {
    this.setState((prevState) => ({
      isSidechainModalVisible: !prevState.isSidechainModalVisible,
    }));
  };

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

  toggleCommissionModal = () => {
    this.setState((prevState) => ({
      isCommissionModalVisible: !prevState.isCommissionModalVisible,
    }));
  };

  confirmWithdraw = () => {
    const { candidateId } = this.state;

    this.contracts.DPoS.methods.confirmWithdraw.cacheSend(candidateId);
  };

  confirmIncreaseCommissionRate = () => {
    this.contracts.DPoS.methods.confirmIncreaseCommissionRate.cacheSend();
  };

  claimValidator = () => {
    this.contracts.DPoS.methods.claimValidator.cacheSend();
  };

  renderAction = () => {
    const { accounts } = this.props;
    const { candidate } = this.state;
    const isOwner = accounts[0] === candidate.args[0];

    const menu = (
      <Menu>
        <Menu.Item onClick={this.toggleSidechainModal}>
          Update Sidechain
        </Menu.Item>
        <Menu.Item onClick={this.toggleDelegateModal}>Delegate</Menu.Item>
        <Menu.Item onClick={this.toggleWithdrawModal}>
          Initialize Withdraw
        </Menu.Item>
        <Menu.Item onClick={this.confirmWithdraw}>Confirm Withdraw</Menu.Item>
        {isOwner && (
          <Menu.Item onClick={this.toggleCommissionModal}>
            Announce Increase Commission Rate
          </Menu.Item>
        )}
        {isOwner && (
          <Menu.Item onClick={this.confirmIncreaseCommissionRate}>
            Confirm Increase Commission Rate
          </Menu.Item>
        )}
        {isOwner && (
          <Menu.Item onClick={this.claimValidator}>Claim Validator</Menu.Item>
        )}
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
    const { SGN } = this.props;
    const { candidate, delegators, punishes } = this.state;
    const candidateId = candidate.args[0];
    const {
      minSelfStake,
      stakingPool,
      status,
      commissionRate,
      rateLockEndTime,
    } = candidate.value;
    const sidechainAddr = _.find(
      SGN.sidechainAddrMap,
      (data) => data.args[0] === candidateId
    );

    return (
      <Row style={{ marginTop: '10px' }}>
        <Col span={12}>
          <Statistic title="Address" value={candidateId} />
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
        <Col span={12}>
          <Statistic
            title="Commission Rate"
            value={commissionRate / RATE_BASE}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Rate Lock End Time"
            value={`${rateLockEndTime} block height`}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Sidechain Address"
            value={_.get(sidechainAddr, 'value')}
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
      isSidechainModalVisible,
      isDelegateModalVisible,
      isWithdrawModalVisible,
      isCommissionModalVisible,
    } = this.state;

    if (!candidate) {
      return <Skeleton />;
    }

    return (
      <Card title="Candidate" extra={this.renderAction()}>
        {this.renderCandidateDetail()}
        <SidechainForm
          visible={isSidechainModalVisible}
          onClose={this.toggleSidechainModal}
        />
        <DelegateForm
          candidateId={candidateId}
          visible={isDelegateModalVisible}
          onClose={this.toggleDelegateModal}
        />
        <WithdrawForm
          candidateId={candidateId}
          visible={isWithdrawModalVisible}
          onClose={this.toggleWithdrawModal}
        />
        <CommissionForm
          candidate={candidate}
          visible={isCommissionModalVisible}
          onClose={this.toggleCommissionModal}
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
  const { accounts, contracts, DPoS, SGN } = state;
  return {
    accounts,
    DPoS: { ...DPoS, ...contracts.DPoS },
    SGN: { ...SGN, ...contracts.SGN },
  };
}

export default drizzleConnect(Candidate, mapStateToProps);
