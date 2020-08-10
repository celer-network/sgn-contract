import React from 'react';
import PropTypes from 'prop-types';
import web3 from 'web3';
import _ from 'lodash';
import { Modal } from 'antd';
import { drizzleConnect } from 'drizzle-react';

import Form from '../form';
import {
    minValueRule,
    celrFieldOptions,
    commissionRateField,
    rateLockEndTimeField
} from '../../utils/form';
import { RATE_BASE } from '../../utils/constant';

class CandidateForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    handleInitializeCandidate = () => {
        const { onClose, network } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                console.log(err);
                return;
            }

            let { minSelfStake = 0, commissionRate, rateLockEndTime } = values;
            rateLockEndTime =
                _.toNumber(rateLockEndTime) + network.block.number;

            this.contracts.DPoS.methods.initializeCandidate.cacheSend(
                web3.utils.toWei(minSelfStake.toString(), 'ether'),
                commissionRate * RATE_BASE,
                rateLockEndTime
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
                    ...celrFieldOptions,
                    placeholder: 'The minimum self stake',
                    initialValue: 0
                },
                rules: [minValueRule(0)]
            },
            commissionRateField,
            rateLockEndTimeField
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

CandidateForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

CandidateForm.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { network } = state;

    return {
        network
    };
}

export default drizzleConnect(CandidateForm, mapStateToProps);
