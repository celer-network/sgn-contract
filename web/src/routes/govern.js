import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Button, Card, List, Statistic, Row, Col, Dropdown, Menu } from 'antd';

import Filter from '../components/filter';
import ProposalForm from '../components/govern/proposal-form';
import { PARAM_NAMES, PROPOSAL_STATUS, VOTE_TYPE } from '../utils/dpos';

class Govern extends React.Component {
    constructor(props, context) {
        super(props);

        this.state = { isProposalModalVisible: false, filter: { status: '1' } };
        this.contracts = context.drizzle.contracts;
    }

    toggleProposalModal = () => {
        this.setState(prevState => ({
            isProposalModalVisible: !prevState.isProposalModalVisible
        }));
    };

    voteParam = (proposalId, voteType) => {
        this.contracts.DPoS.methods.voteParam.cacheSend(proposalId, voteType);
    };

    confirmParamProposal = proposalId => {
        this.contracts.DPoS.methods.confirmParamProposal.cacheSend(proposalId);
    };

    updateFilter = change => {
        this.setState(prevState => ({
            filter: { ...prevState.filter, ...change }
        }));
    };

    renderFilters = () => {
        const { status } = this.state.filter;
        const proposalStatus = _.map(PROPOSAL_STATUS, (value, status) => [
            value,
            status
        ]);

        return (
            <Filter
                name="status"
                options={proposalStatus}
                style={{ width: 100 }}
                onChange={this.updateFilter}
                value={status}
                allowClear
            />
        );
    };

    renderProposal = propsal => {
        const proposalId = propsal.args[0];
        const { voteDeadline, record, newValue } = propsal.value;
        const menu = (
            <Menu>
                {_.map(VOTE_TYPE, (value, type) => (
                    <Menu.Item
                        onClick={() => this.voteParam(proposalId, value)}
                    >
                        {type}
                    </Menu.Item>
                ))}
            </Menu>
        );

        return (
            <List.Item>
                <Card
                    actions={[
                        <Dropdown overlay={menu}>
                            <Button
                                type="link"
                                title="Vote"
                                icon="audit"
                                size="small"
                            >
                                Vote
                            </Button>
                        </Dropdown>,
                        <Button
                            type="link"
                            title="Vote"
                            icon="check-square"
                            size="small"
                            onClick={() =>
                                this.confirmParamProposal(proposalId)
                            }
                        >
                            Confirm Proposal
                        </Button>
                    ]}
                >
                    <Row>
                        <Col span={12}>
                            <Statistic title="Proposal ID" value={proposalId} />
                        </Col>
                        <Col span={12}>
                            <Statistic
                                title="Vote Deadline"
                                value={voteDeadline}
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic
                                title="Record"
                                value={PARAM_NAMES[record]}
                            />
                        </Col>
                        <Col span={12}>
                            <Statistic title="New Value" value={newValue} />
                        </Col>
                    </Row>
                </Card>
            </List.Item>
        );
    };

    renderProposals = () => {
        const { DPoS } = this.props;
        const { filter } = this.state;
        let proposals = _.values(DPoS.paramProposals);

        proposals = _.filter(proposals, proposal => {
            const { status } = proposal.value;
            console.log(proposal.value);
            return filter.status === status;
        });

        return (
            <List
                grid={{ gutter: 16, column: 2 }}
                dataSource={proposals}
                renderItem={this.renderProposal}
            />
        );
    };

    render() {
        const { isProposalModalVisible } = this.state;

        return (
            <Card
                title="Govern"
                extra={
                    <Button type="primary" onClick={this.toggleProposalModal}>
                        Create Proposal
                    </Button>
                }
            >
                {this.renderFilters()}
                {this.renderProposals()}
                <ProposalForm
                    visible={isProposalModalVisible}
                    onClose={this.toggleProposalModal}
                />
            </Card>
        );
    }
}

Govern.propTypes = {
    dispatch: PropTypes.func.isRequired
};

Govern.contextTypes = {
    drizzle: PropTypes.object
};

function mapStateToProps(state) {
    const { contracts, DPoS } = state;

    return {
        DPoS: { ...DPoS, ...contracts.DPoS }
    };
}

export default drizzleConnect(Govern, mapStateToProps);
