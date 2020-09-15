import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { drizzleConnect } from 'drizzle-react';
import { Card } from 'antd';

import CandidateTable from '../components/dpos/candidate-table';

class DPoS extends React.Component {
  render() {
    const { DPoS } = this.props;

    return (
      <Card title="Validators">
        <CandidateTable candidates={_.values(DPoS.getCandidateInfo)} />
      </Card>
    );
  }
}

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
