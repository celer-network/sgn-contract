import React from 'react';
import PropTypes from 'prop-types';
import { drizzleConnect } from 'drizzle-react';
import { Table } from 'antd';

import { formatCelrValue } from '../../utils/unit';

const columns = [
    {
        title: 'Delegator',
        dataIndex: 'delegator'
    },
    {
        title: 'Amount',
        dataIndex: 'amount'
    }
];

class SlashTable extends React.Component {
    render() {
        const { slashes } = this.props;

        const dataSource = slashes
            .sort((slash0, slash1) => {
                return slash0.validator > slash1.validator;
            })
            .map(slash => ({
                ...slash,
                amount: formatCelrValue(slash.amount)
            }));

        console.log(slashes);
        return (
            <Table
                dataSource={dataSource}
                columns={columns}
                pagination={false}
            />
        );
    }
}

SlashTable.propTypes = {
    slashes: PropTypes.array.isRequired
};

function mapStateToProps(state) {
    return {};
}

export default drizzleConnect(SlashTable, mapStateToProps);
