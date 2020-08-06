import { RATE_PRECISION, RATE_BASE } from './constant';

export const currencyFieldOptions = unit => ({
    formatter: value => (value ? `${value}${unit}` : ''),
    parser: value => value.replace(/[A-Z]/g, '')
});

export const celrFieldOptions = currencyFieldOptions('CELR');

export const dayFieldOptions = {
    formatter: value => (value ? `${value}day` : ''),
    parser: value => value.replace(/[a-z]/g, '')
};

export const blockFieldOptions = {
    formatter: value => (value ? `${value}block` : ''),
    parser: value => value.replace(/[a-z]/g, '')
};

export const rateFieldOptions = {
    formatter: value => (value ? `${value}%` : ''),
    parser: value => value.replace(/[%]/g, '')
};

export const minValueRule = minValue => ({
    validator: (rule, value, callback) => {
        if (value < minValue) {
            const msg = `value is smaller than ${minValue}`;
            callback(msg);
        }

        callback();
    }
});

export const commissionRateField = {
    name: 'commissionRate',
    label: 'Commission Rate',
    field: 'number',
    fieldOptions: {
        ...rateFieldOptions,
        placeholder: 'The commission rate',
        step: 1 / RATE_BASE,
        precision: RATE_PRECISION
    },
    rules: [
        minValueRule(0),
        {
            message: 'Please enter a commission rate!',
            required: true
        }
    ]
};

export const rateLockEndTimeField = {
    name: 'rateLockEndTime',
    label: 'Rate Lock End Time',
    fieldOptions: {
        placeholder: 'The rate lock end time',
        prefix: '+',
        suffix: 'blocks'
    },
    rules: [
        {
            message: 'Please enter a rate lock end time!',
            required: true
        }
    ]
};
