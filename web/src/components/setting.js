import React from 'react';
import PropTypes from 'prop-types';
import { Drawer } from 'antd';
import { drizzleConnect } from 'drizzle-react';

import Form from './form';

class SettingForm extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.form = React.createRef();
        this.contracts = context.drizzle.contracts;
    }

    handleSubmit = () => {
        const { onClose, dispatch } = this.props;

        this.form.current.validateFields((err, values) => {
            if (err) {
                console.log(err);
                return;
            }

            dispatch({
                type: 'network/saveSetting',
                payload: { setting: values }
            });

            onClose();
        });
    };

    render() {
        const {
            visible,
            onClose,
            network: { setting = {} }
        } = this.props;

        const formItems = [
            {
                name: 'gateway',
                initialValue: setting.gateway,
                fieldOptions: {
                    placeholder: 'The gateway URL'
                },
                rules: [
                    {
                        message: 'Please enter gateway URL!',
                        required: true
                    }
                ]
            }
        ];

        return (
            <Drawer
                title="Setting"
                placement="right"
                width="500"
                onClose={onClose}
                visible={visible}
            >
                <Form
                    ref={this.form}
                    items={formItems}
                    onSubmit={this.handleSubmit}
                />
            </Drawer>
        );
    }
}

SettingForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

SettingForm.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { network } = state;

    return {
        network
    };
}

export default drizzleConnect(SettingForm, mapStateToProps);
