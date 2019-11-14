import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import { Modal } from 'antd';

import Form from '../form';
import { celerFieldOptions } from '../../utils/form';

class DelegateForm extends React.Component {
  constructor(props, context) {
    super(props);

    this.form = React.createRef();
    this.contracts = context.drizzle.contracts;
  }

  onSubmit = () => {
    const { onClose, candidate } = this.props;

    this.form.current.validateFields((err, values) => {
      if (err) {
        return;
      }

      const { value } = values;

      this.contracts.Guard.methods.delegate.cacheSend(
        candidate,
        web3.utils.toWei(value.toString(), 'ether')
      );

      onClose();
    });
  };

  render() {
    const { visible, onClose } = this.props;
    const formItems = [
      {
        name: 'value',
        field: 'number',
        fieldOptions: {
          ...celerFieldOptions,
          placeholder: 'The amount of CELR to delegate'
        },
        rules: [
          {
            message: 'Please enter a value!',
            required: true
          }
        ]
      }
    ];

    return (
      <Modal
        title="Delegate Stake"
        visible={visible}
        onOk={this.onSubmit}
        onCancel={onClose}
      >
        <Form ref={this.form} items={formItems} />
      </Modal>
    );
  }
}

DelegateForm.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

DelegateForm.contextTypes = {
  drizzle: PropTypes.object
};

export default DelegateForm;
