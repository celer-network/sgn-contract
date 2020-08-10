import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import { Modal } from 'antd';

import Form from './form';
import { celrFieldOptions } from '../utils/form';

class ApproveCelrForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    onSubmit = () => {
        const { onClose } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                return;
            }

            const { value } = values;

            this.contracts.CELRToken.methods
                .approve(
                    this.contracts.DPoS.address,
                    web3.utils.toWei(value.toString(), 'ether')
                )
                .send();

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
                    ...celrFieldOptions,
                    placeholder: 'The amount of CELR allowance DPoS has'
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
                title="Approve CELR to DPoS"
                visible={visible}
                onOk={this.onSubmit}
                onCancel={onClose}
            >
                <Form ref={this.form} items={formItems} />
            </Modal>
        );
    }
}

ApproveCelrForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

ApproveCelrForm.contextTypes = {
    drizzle: PropTypes.object
};

export default ApproveCelrForm;
