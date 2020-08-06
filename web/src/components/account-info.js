import React, { useState } from 'react';
import { Card, Statistic, Button } from 'antd';

import Setting from './setting';
import { formatCelrValue } from '../utils/unit';

function AccountInfo(props) {
    const { celrValue } = props;
    const [showSetting, setShowSetting] = useState(false);

    return (
        <>
            <Card
                className="account-info"
                title="Account info"
                extra={
                    <Button
                        icon="setting"
                        title="Setting"
                        onClick={() => setShowSetting(true)}
                    />
                }
            >
                <Statistic
                    title="CELR allowance for DPoS"
                    value={formatCelrValue(celrValue)}
                />
            </Card>
            <Setting
                visible={showSetting}
                onClose={() => setShowSetting(false)}
            />
        </>
    );
}

export default AccountInfo;
