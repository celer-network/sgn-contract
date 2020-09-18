import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { routerRedux } from 'dva/router';
import { Table } from 'antd';
import web3 from 'web3';

import { CANDIDATE_STATUS } from '../../utils/dpos';
import { formatCelrValue } from '../../utils/unit';
import { RATE_BASE } from '../../utils/constant';

const columns = [
  {
    title: 'Address',
    dataIndex: 'address',
    width: 450,
    sorter: (a, b) => a.address - b.address
  },
  {
    title: 'Status',
    dataIndex: 'status',
    width: 150,
    filters: _.map(CANDIDATE_STATUS, (text, index) => ({
      text,
      value: index.toString()
    })),
    filterMultiple: false,
    onFilter: (value, record) => record.status === value,
    sorter: (a, b) => a.status - b.status,
    render: text => CANDIDATE_STATUS[text]
  },
  {
    title: 'Staking Pool',
    dataIndex: 'stakingPool',
    defaultSortOrder: 'descend',
    sorter: (a, b) => {
      return web3.utils.toBN(a.stakingPool).cmp(web3.utils.toBN(b.stakingPool));
    },
    render: text => formatCelrValue(text)
  },
  {
    title: 'Min Self Stake',
    dataIndex: 'minSelfStake',
    sorter: (a, b) => {
      return web3.utils
        .toBN(a.minSelfStake)
        .cmp(web3.utils.toBN(b.minSelfStake));
    },
    render: text => formatCelrValue(text)
  },
  {
    title: 'Commission',
    dataIndex: 'commissionRate',
    width: 140,
    sorter: (a, b) => a.commissionRate - b.commissionRate,
    render: text => `${text / RATE_BASE} %`
  }
];

class CandidateTable extends React.Component {
  onRow = record => {
    const { dispatch } = this.props;

    return {
      onClick: () => {
        dispatch(
          routerRedux.push({
            pathname: `/candidate/${record.address}`
          })
        );
      }
    };
  };

  render() {
    const { candidates } = this.props;
    const dataSource = candidates.map(candidate => ({
      ...candidate.value,
      address: candidate.args[0]
    }));

    return (
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        onRow={this.onRow}
      />
    );
  }
}

CandidateTable.propTypes = {
  dispatch: PropTypes.func.isRequired,
  candidates: PropTypes.array.isRequired
};

function mapStateToProps(state) {
  return {};
}

export default drizzleConnect(CandidateTable, mapStateToProps);
