import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import web3 from 'web3';
import { Table } from 'antd';

import { formatCelrValue } from '../../utils/unit';

const columns = [
  {
    title: 'Delegator',
    dataIndex: 'delegator'
  },
  {
    title: 'Delegated Stake',
    dataIndex: 'delegatedStake',
    sorter: (a, b) => {
      return web3.utils
        .toBN(a.delegatedStake)
        .cmp(web3.utils.toBN(b.delegatedStake));
    },
    sortOrder: 'descend',
    render: text => formatCelrValue(text)
  },
  {
    title: 'Undelegating Stake',
    dataIndex: 'undelegatingStake',
    render: text => formatCelrValue(text)
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
        delegator: delegator.args[1]
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

function mapStateToProps(state) {
  return {};
}

export default drizzleConnect(DelegatorTable, mapStateToProps);
