import React from 'react';
import PropTypes from 'prop-types';
import { drizzleConnect } from 'drizzle-react';
import { Statistic, Row, Col, message, Table } from 'antd';
import axios from 'axios';

import { formatCelrValue } from '../../utils/unit';

const columns = [
    {
        title: 'Delegator',
        dataIndex: 'delegatorAddr'
    },
    {
        title: 'Delegated Stake',
        dataIndex: 'delegatedStake',
        render: text => {
            return formatCelrValue(text);
        }
    }
];

class SidechainInfo extends React.Component {
    constructor(props, context) {
        super(props);

        const {
            candidateId,
            network: { setting }
        } = props;
        this.state = {};

        axios
            .get(`${setting.gateway}/validator/candidate/${candidateId}`)
            .then(res => {
                this.setState({
                    ...res.data.result
                });
            })
            .catch(err => {
                console.error(err);
                message.warning(
                    'Please config gateway url in setting to load sidechain info correctly'
                );
            });
    }

    render() {
        const {
            commissionRate,
            stakingPool,
            delegators,
            description = {}
        } = this.state;
        return (
            <Row>
                <Col span={12}>
                    <Statistic
                        title="Commission Rate"
                        value={`${commissionRate * 100} %`}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="Staking Pool"
                        value={formatCelrValue(stakingPool)}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="Website"
                        value={description.website || 'N/A'}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="Contact"
                        value={description.security_contact || 'N/A'}
                    />
                </Col>

                <Col span={24}>
                    <Table
                        dataSource={delegators}
                        columns={columns}
                        pagination={false}
                    />
                </Col>
            </Row>
        );
    }
}

SidechainInfo.propTypes = {};

SidechainInfo.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { network } = state;

    return {
        network
    };
}

export default drizzleConnect(SidechainInfo, mapStateToProps);
