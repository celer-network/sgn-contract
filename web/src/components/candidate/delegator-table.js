import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Table } from 'antd';

import { formatCelrValue } from '../../utils/unit';

const columns = [
    {
        title: 'Delegator',
        dataIndex: 'delegator'
    },
    {
        title: 'Delegated Stake',
        dataIndex: 'delegatedStake'
    },
    {
        title: 'Undelegating Stake',
        dataIndex: 'undelegatingStake'
    }
];

const nestedColumns = [
    {
        title: 'Intent Withdraw Amount',
        dataIndex: 'intentAmount'
    },
    {
        title: 'Intent Withdraw Block Height',
        dataIndex: 'intentProposedTime'
    }
];

class DelegatorTable extends React.Component {
    expandedRowRender = record => {
        const dataSource = _.zip(
            record.intentAmounts,
            record.intentProposedTimes
        ).map(([intentAmount, intentProposedTime]) => ({
            intentAmount: formatCelrValue(intentAmount),
            intentProposedTime
        }));

        return (
            <Table
                columns={nestedColumns}
                dataSource={dataSource}
                pagination={false}
            />
        );
    };

    render() {
        const { delegators } = this.props;
        const dataSource = delegators
            .filter(delegator => delegator.value)
            .sort((delegator0, delegator1) => {
                return delegator0.args[1] > delegator1.args[1];
            })
            .map(delegator => ({
                ...delegator.value,
                delegator: delegator.args[1],
                delegatedStake: formatCelrValue(delegator.value.delegatedStake),
                undelegatingStake: formatCelrValue(
                    delegator.value.undelegatingStake
                )
            }));

        return (
            <Table
                dataSource={dataSource}
                columns={columns}
                pagination={false}
                expandedRowRender={this.expandedRowRender}
            />
        );
    }
}

DelegatorTable.propTypes = {
    delegators: PropTypes.array.isRequired
};

function mapStateToProps(state) {}

export default drizzleConnect(DelegatorTable, mapStateToProps);
