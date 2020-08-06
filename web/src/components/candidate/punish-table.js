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

class PunishTable extends React.Component {
    render() {
        const { punishes } = this.props;

        const dataSource = punishes
            .sort((punish0, punish1) => {
                return punish0.validator > punish1.validator;
            })
            .map(punish => ({
                ...punish,
                amount: formatCelrValue(punish.amount)
            }));

        console.log(punishes);
        return (
            <Table
                dataSource={dataSource}
                columns={columns}
                pagination={false}
            />
        );
    }
}

PunishTable.propTypes = {
    punishes: PropTypes.array.isRequired
};

function mapStateToProps(state) {}

export default drizzleConnect(PunishTable, mapStateToProps);
