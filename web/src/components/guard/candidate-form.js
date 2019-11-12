import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import { Modal } from 'antd';

import Form from '../form';
import {
  currencyFieldOptions,
  rateFieldOptions,
  minValueRule,
  blockFieldOptions,
  dayFieldOptions
} from '../../utils/form';
import { getUnitByAddress } from '../../utils/unit';

class AuctionForm extends React.Component {
  constructor(props, context) {
    super(props);

    this.state = {};
    this.form = React.createRef();
    this.contracts = context.drizzle.contracts;
  }

  handleValueChange = changedValue => this.setState(changedValue);

  handleInitAuction = () => {
    const { onClose } = this.props;

    this.form.current.validateFields((err, values) => {
      if (err) {
        return;
      }

      const {
        token,
        bidDuration,
        revealDuration,
        claimDuration,
        challengeDuration,
        finalizeDuration,
        value,
        duration,
        maxRate,
        minValue,
        collateralAddress,
        collateralValue = 0
      } = values;

      this.contracts.LiBA.methods.initAuction.cacheSend(
        token,
        bidDuration,
        revealDuration,
        claimDuration,
        challengeDuration,
        finalizeDuration,
        web3.utils.toWei(value.toString(), 'ether'),
        duration,
        maxRate,
        web3.utils.toWei(minValue.toString(), 'ether'),
        collateralAddress,
        web3.utils.toWei(collateralValue.toString(), 'ether')
      );
      onClose();
    });
  };

  render() {
    const { visible, network, onClose } = this.props;
    const supportedTokenOptions = network.supportedTokens.map(
      supportedToken => [
        supportedToken.address,
        `${supportedToken.symbol} (${supportedToken.address})`
      ]
    );
    const unit = getUnitByAddress(network.supportedTokens, this.state.token);

    const formItems = [
      {
        name: 'token',
        field: 'select',
        fieldOptions: {
          options: supportedTokenOptions,
          placeholder: 'Token type to borrow'
        },
        rules: [
          {
            message: 'Please select a token!',
            required: true
          }
        ]
      },
      {
        name: 'value',
        field: 'number',
        fieldOptions: {
          ...currencyFieldOptions(unit),
          placeholder: 'The amount of token to borrow'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a value!',
            required: true
          }
        ]
      },
      {
        name: 'duration',
        field: 'number',
        fieldOptions: {
          ...dayFieldOptions,
          placeholder: 'The duration of the borrowing'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      },
      {
        name: 'maxRate',
        label: 'Max Rate',
        field: 'number',
        fieldOptions: {
          ...rateFieldOptions,
          step: 0.001,
          precision: 3,
          placeholder: 'The maximum interest rate'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a max rate!',
            required: true
          }
        ]
      },
      {
        name: 'minValue',
        label: 'Min Value',
        field: 'number',
        fieldOptions: {
          ...currencyFieldOptions(unit),
          placeholder: 'The minimum value for bidding'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a min value!',
            required: true
          }
        ]
      },
      {
        name: 'collateralAddress',
        label: 'Collateral Address',
        fieldOptions: {
          placeholder: 'The address of collateral token'
        }
      },
      {
        name: 'collateralValue',
        label: 'Collateral Value',
        field: 'number',
        fieldOptions: {
          placeholder: 'The amount of collateral token'
        },
        rules: [minValueRule(0)]
      },
      {
        name: 'bidDuration',
        label: 'Bid Duration',
        field: 'number',
        fieldOptions: {
          ...blockFieldOptions,
          placeholder: 'The duration of bidding period'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      },
      {
        name: 'revealDuration',
        label: 'Reveal Duration',
        field: 'number',
        fieldOptions: {
          ...blockFieldOptions,
          placeholder: 'The duration of revealing period'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      },
      {
        name: 'claimDuration',
        label: 'Claim Duration',
        field: 'number',
        fieldOptions: {
          ...blockFieldOptions,
          placeholder: 'The duration of claiming period'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      },
      {
        name: 'challengeDuration',
        label: 'Challenge Duration',
        field: 'number',
        fieldOptions: {
          ...blockFieldOptions,
          placeholder: 'The duration of challenge period'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      },
      {
        name: 'finalizeDuration',
        label: 'Finalize Duration',
        field: 'number',
        fieldOptions: {
          ...blockFieldOptions,
          placeholder: 'The duration of finalize period'
        },
        rules: [
          minValueRule(0),
          {
            message: 'Please enter a duration!',
            required: true
          }
        ]
      }
    ];

    return (
      <Modal
        title="Launch Auction"
        visible={visible}
        onOk={this.handleInitAuction}
        onCancel={onClose}
      >
        <Form
          ref={this.form}
          items={formItems}
          onValuesChange={this.handleValueChange}
        />
      </Modal>
    );
  }
}

AuctionForm.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

AuctionForm.contextTypes = {
  drizzle: PropTypes.object
};

export default AuctionForm;
