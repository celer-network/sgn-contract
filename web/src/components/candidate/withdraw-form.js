import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import { Modal } from 'antd';

import Form from '../form';
import { celrFieldOptions } from '../../utils/form';

class WithdrawForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    onSubmit = () => {
        const { onClose, candidate } = this.props;
        const candidateAddr = candidate.args[0];

        this.form.current.validateFields((err, values) => {
            if (err) {
                return;
            }

            const { value } = values;

            if (candidate.value.status === '0') {
                this.contracts.DPoS.methods.withdrawFromUnbondedCandidate.cacheSend(
                    candidateAddr,
                    web3.utils.toWei(value.toString(), 'ether')
                );
            } else {
                this.contracts.DPoS.methods.intendWithdraw.cacheSend(
                    candidateAddr,
                    web3.utils.toWei(value.toString(), 'ether')
                );
            }

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
                    placeholder: 'The amount of CELR to withdraw'
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
                title="Withdraw Stake"
                visible={visible}
                onOk={this.onSubmit}
                onCancel={onClose}
            >
                <Form ref={this.form} items={formItems} />
            </Modal>
        );
    }
}

WithdrawForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

WithdrawForm.contextTypes = {
    drizzle: PropTypes.object
};

export default WithdrawForm;
