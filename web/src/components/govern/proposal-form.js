import React from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';

import Form from '../form';
import { PARAM_NAMES } from '../../utils/dpos';
import { minValueRule } from '../../utils/form';

class ProposalForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    handleCreateParamProposal = () => {
        const { onClose } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                console.log(err);
                return;
            }

            let { value, record } = values;

            this.contracts.DPoS.methods.createParamProposal.cacheSend(
                record,
                value
            );
            onClose();
        });
    };

    render() {
        const { visible, onClose } = this.props;
        const recordOptions = PARAM_NAMES.map((param, index) => [index, param]);

        const formItems = [
            {
                name: 'record',
                field: 'select',
                fieldOptions: {
                    options: recordOptions,
                    placeholder: 'The parameter record'
                },
                rules: [
                    {
                        message: 'Please select a record!',
                        required: true
                    }
                ]
            },
            {
                name: 'value',
                label: 'Value',
                field: 'number',
                fieldOptions: {
                    placeholder: 'The new value'
                },
                rules: [
                    minValueRule(0),
                    {
                        message: 'Please enter a new value!',
                        required: true
                    }
                ]
            }
        ];

        return (
            <Modal
                title="Create Param Proposal"
                visible={visible}
                onOk={this.handleCreateParamProposal}
                onCancel={onClose}
            >
                <Form ref={this.form} items={formItems} />
            </Modal>
        );
    }
}

ProposalForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

ProposalForm.contextTypes = {
    drizzle: PropTypes.object
};

export default ProposalForm;
