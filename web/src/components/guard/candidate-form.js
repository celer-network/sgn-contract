import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import { Modal } from 'antd';

import Form from '../form';
import { minValueRule, celerFieldOptions } from '../../utils/form';

class AuctionForm extends React.Component {
  constructor(props, context) {
    super(props);

    this.state = {};
    this.form = React.createRef();
    this.contracts = context.drizzle.contracts;
  }

  handleInitializeCandidate = () => {
    const { onClose } = this.props;

    this.form.current.validateFields((err, values) => {
      if (err) {
        console.log(err);
        return;
      }

      const { minSelfStake = 0, sidechainAddr } = values;
      this.contracts.Guard.methods.initializeCandidate.cacheSend(
        web3.utils.toWei(minSelfStake.toString(), 'ether'),
        sidechainAddr
      );
      onClose();
    });
  };

  render() {
    const { visible, onClose } = this.props;

    const formItems = [
      {
        name: 'minSelfStake',
        label: 'Min Self Stake',
        field: 'number',
        fieldOptions: {
          ...celerFieldOptions(),
          placeholder: 'The minimum self stake',
          initialValue: 0
        },
        rules: [minValueRule(0)]
      },
      {
        name: 'sidechainAddr',
        label: 'Sidechain Address',
        fieldOptions: {
          placeholder: 'The account address on sgn'
        },
        rules: [
          {
            message: 'Please enter a sidechainAddr!',
            required: true
          }
        ]
      }
    ];

    return (
      <Modal
        title="Initialize Candidate"
        visible={visible}
        onOk={this.handleInitializeCandidate}
        onCancel={onClose}
      >
        <Form ref={this.form} items={formItems} />
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
