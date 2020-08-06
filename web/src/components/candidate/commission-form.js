import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { Modal } from 'antd';
import { drizzleConnect } from 'drizzle-react';

import Form from '../form';
import { commissionRateField, rateLockEndTimeField } from '../../utils/form';
import { RATE_BASE } from '../../utils/constant';

class CommissionForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    handleIncreaseCommission = () => {
        const { onClose, network, candidate } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                console.log(err);
                return;
            }

            let { commissionRate, rateLockEndTime } = values;
            commissionRate = commissionRate * RATE_BASE;
            rateLockEndTime =
                _.toNumber(rateLockEndTime) + network.block.number;

            if (commissionRate > candidate.value.commissionRate) {
                this.contracts.DPoS.methods.announceIncreaseCommissionRate.cacheSend(
                    commissionRate,
                    rateLockEndTime
                );
            } else {
                this.contracts.DPoS.methods.nonIncreaseCommissionRate.cacheSend(
                    commissionRate,
                    rateLockEndTime
                );
            }
            onClose();
        });
    };

    render() {
        const { visible, onClose } = this.props;

        const formItems = [commissionRateField, rateLockEndTimeField];

        return (
            <Modal
                title="Increase Commission Rate"
                visible={visible}
                onOk={this.handleIncreaseCommission}
                onCancel={onClose}
            >
                <Form ref={this.form} items={formItems} />
            </Modal>
        );
    }
}

CommissionForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

CommissionForm.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { network } = state;

    return {
        network
    };
}

export default drizzleConnect(CommissionForm, mapStateToProps);
