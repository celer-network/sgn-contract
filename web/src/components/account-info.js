import React from 'react';
import { Card, Statistic } from 'antd';

import { formatCelrValue } from '../utils/unit';

function AccountInfo(props) {
  const { celrValue } = props;

  return (
    <Card className="account-info" title="Account info">
      <Statistic
        title="CELR allowance for DPoS"
        value={formatCelrValue(celrValue)}
      />
    </Card>
  );
}

export default AccountInfo;
