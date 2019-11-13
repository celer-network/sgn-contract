import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Link } from 'dva/router';
import { Button, Card, List, Statistic, Row, Col, Icon } from 'antd';

import CandidateForm from '../components/guard/candidate-form';
import { getUnitByAddress, formatCurrencyValue } from '../utils/unit';

class Guard extends React.Component {
  constructor(props, context) {
    super(props);

    this.state = { isModalVisible: false, tab: 'all' };
    this.contracts = context.drizzle.contracts;
  }

  onTabChange = tab => {
    this.setState({ tab });
  };

  toggleModal = () => {
    this.setState(prevState => ({
      isModalVisible: !prevState.isModalVisible
    }));
  };

  renderCandidate = candidate => {
    const { network, Guard } = this.props;
    const { asker, value, duration, tokenAddress } = candidate.value;
    const unit = getUnitByAddress(network.supportedTokens, tokenAddress);

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
              <Statistic title="Asker" value={asker} />
            </Col>
            <Col span={12}>
              <Statistic title="Period" value={1} />
            </Col>
            <Col span={12}>
              <Statistic
                title="Value"
                value={formatCurrencyValue(value, unit)}
              />
            </Col>
            <Col span={12}>
              <Statistic title="Duration" value={`${duration} Day`} />
            </Col>
          </Row>
        </Card>
      </List.Item>
    );
  };

  renderCandidates = () => {
    const { accounts, Guard } = this.props;
    const { tab } = this.state;

    let data = _.values(Guard.getAuction);

    return (
      <List
        grid={{ gutter: 16, column: 3 }}
        dataSource={data}
        renderItem={this.renderCandidate}
      />
    );
  };

  render() {
    const { isModalVisible, tab } = this.state;
    const { network } = this.props;

    return (
      <Card
        title="Guard"
        extra={
          <Button type="primary" onClick={this.toggleModal}>
            Launch candidate
          </Button>
        }
      >
        {this.renderCandidates()}
        <CandidateForm
          network={network}
          visible={isModalVisible}
          onClose={this.toggleModal}
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
  const { contracts, accounts, Guard, network } = state;

  return {
    accounts,
    network,
    Guard: { ...Guard, ...contracts.Guard }
  };
}

export default drizzleConnect(Guard, mapStateToProps);
