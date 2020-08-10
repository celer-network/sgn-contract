import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Link } from 'dva/router';
import { Button, Card, List, Statistic, Row, Col, Icon } from 'antd';

import { CANDIDATE_STATUS } from '../utils/dpos';
import { formatCelrValue } from '../utils/unit';

class DPoS extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = {};
        this.contracts = context.drizzle.contracts;
    }

    renderCandidate = candidate => {
        const { minSelfStake, stakingPool, status } = candidate.value;

        return (
            <List.Item>
                <Card
                    actions={[
                        <Link to={`/candidate/${candidate.args[0]}`}>
                            <Icon type="eye" title="View Detail" />
                        </Link>
                    ]}
                >
                    <Row>
                        <Col span={12}>
                            <Statistic
                                title="Address"
                                value={candidate.args[0]}
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic
                                title="Status"
                                value={CANDIDATE_STATUS[status]}
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic
                                title="Min Self Stake"
                                value={formatCelrValue(minSelfStake)}
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic
                                title="Staking Pool"
                                value={formatCelrValue(stakingPool)}
                            />
                        </Col>
                    </Row>
                </Card>
            </List.Item>
        );
    };

    renderCandidates = () => {
        const { DPoS } = this.props;
        const data = _.values(DPoS.getCandidateInfo).sort(
            (candidate0, candidate1) => {
                return candidate0.args[0] > candidate1.args[0];
            }
        );

        return (
            <List
                grid={{ gutter: 16, column: 3 }}
                dataSource={data}
                renderItem={this.renderCandidate}
            />
        );
    };

    render() {
        return <Card title="Validators">{this.renderCandidates()}</Card>;
    }
}

DPoS.propTypes = {
    dispatch: PropTypes.func.isRequired
};

DPoS.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { contracts, DPoS } = state;

    return {
        DPoS: { ...DPoS, ...contracts.DPoS }
    };
}

export default drizzleConnect(DPoS, mapStateToProps);
