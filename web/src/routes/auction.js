import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import {
  Alert,
  Button,
  Card,
  Steps,
  Skeleton,
  Statistic,
  Row,
  Col,
  notification
} from 'antd';

import { formatCurrencyValue, getUnitByAddress } from '../utils/unit';
import { EMPTY_ADDRESS } from '../utils/constant';

class Auction extends React.Component {
  constructor(props, context) {
    super(props);

    this.contracts = context.drizzle.contracts;
    this.state = {
      auction: null,
      currentStep: 0,
      currentPeriod: ''
    };

    const auctionId = parseInt(props.match.params.id);
  }

  static getDerivedStateFromProps(props) {}

  renderAction = () => {
    const { accounts } = this.props;
    const currentAccount = accounts[0];

    return [
      <Button block type="primary" onClick={this.takeAction}>
        {currentAccount}
      </Button>
    ];
  };

  renderAuctionDetail = () => {
    const { network } = this.props;
    const { auction, bids, winners } = this.state;
    const {
      asker,
      tokenAddress,
      collateralAddress,
      collateralValue,
      value,
      duration,
      maxRate,
      minValue
    } = auction.value;
    const unit = getUnitByAddress(network.supportedTokens, tokenAddress);
    return (
      <Row style={{ marginTop: '10px' }}>
        <Col span={24}>
          <Statistic title="Asker" value={asker} />
        </Col>
        <Col span={24}>
          <Statistic title="Token Address" value={tokenAddress} />
        </Col>
        <Col span={12}>
          <Statistic title="Value" value={formatCurrencyValue(value, unit)} />
        </Col>
        <Col span={12}>
          <Statistic title="Duration" value={`${duration} Day`} />
        </Col>
        <Col span={12}>
          <Statistic
            title="Min Value"
            value={formatCurrencyValue(minValue, unit)}
          />
        </Col>
        <Col span={12}>
          <Statistic title="Max Rate" value={`${maxRate} %`} />
        </Col>
        {collateralValue > 0 && (
          <>
            (
            <Col span={12}>
              <Statistic title="Collateral Address" value={collateralAddress} />
            </Col>
            <Col span={12}>
              <Statistic title="Collateral Value" value={collateralValue} />
            </Col>
          </>
        )}
      </Row>
    );
  };

  render() {
    const { network } = this.props;
    const { auction, currentStep, currentPeriod } = this.state;

    if (!auction) {
      return <Skeleton />;
    }

    return (
      <Card title="Auction" actions={this.renderAction()}>
        {this.renderAuctionDetail()}
      </Card>
    );
  }
}

Auction.propTypes = {
  dispatch: PropTypes.func.isRequired
};

Auction.contextTypes = {
  drizzle: PropTypes.object
};

function mapStateToProps(state) {
  const { accounts, contracts, LiBA, network } = state;

  return {
    accounts,
    network,
    LiBA: { ...LiBA, ...contracts.LiBA }
  };
}

export default drizzleConnect(Auction, mapStateToProps);
