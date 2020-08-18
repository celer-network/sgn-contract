import _ from 'lodash';
import web3 from 'web3';

import './network';

export const CELR = 'CELR';

export const getUnitByAddress = (supportedTokens, address) => {
    const token = _.find(
        supportedTokens,
        supportedToken => supportedToken.address === address
    );

    if (!token) {
        return '';
    }
    return token.symbol;
};

export const formatCurrencyValue = (value, unit) => {
    if (!value) {
        return;
    }

    const num = _.toNumber(value);

    if (num < 100000) {
        return `${value} wei`;
    }

    return `${web3.utils.fromWei(value).split('.')[0]} ${unit}`;
};

export const formatCelrValue = value => {
    return formatCurrencyValue(value, CELR);
};
