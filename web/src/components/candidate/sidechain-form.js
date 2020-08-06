import React from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';

import Form from '../form';

class SidechainForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    handleUpdateSidechain = () => {
        const { onClose } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                console.log(err);
                return;
            }

            let { sidechainAddr } = values;
            if (!sidechainAddr.startsWith('0x')) {
                sidechainAddr = '0x' + sidechainAddr;
            }

            this.contracts.SGN.methods.updateSidechainAddr.cacheSend(
                sidechainAddr
            );
            onClose();
        });
    };

    render() {
        const { visible, onClose } = this.props;

        const formItems = [
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
                title="Update Sidechain"
                visible={visible}
                onOk={this.handleUpdateSidechain}
                onCancel={onClose}
            >
                <Form ref={this.form} items={formItems} />
            </Modal>
        );
    }
}

SidechainForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

SidechainForm.contextTypes = {
    drizzle: PropTypes.object
};

export default SidechainForm;
