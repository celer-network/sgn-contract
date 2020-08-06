import React from 'react';
import _ from 'lodash';
import { Form } from 'antd';

import Select from './select';

const FormItem = Form.Item;

export default class Filter extends React.PureComponent {
    onChange = value => {
        const { name, onChange } = this.props;

        if (name) {
            onChange({ [name]: value });
            return;
        }

        onChange(value);
    };

    render() {
        const { allowClear, label, name, mode, value } = this.props;
        const selectProps = {
            ..._.omit(this.props, ['label', 'name', 'onChange'])
        };

        if (mode === 'multiple' && !value) {
            selectProps.value = [];
        }

        if (!mode && !allowClear) {
            selectProps.allowClear = false;
        }

        return (
            <FormItem
                className="dropdown-filter"
                label={label || _.capitalize(name)}
            >
                <Select {...selectProps} onChange={this.onChange} />
            </FormItem>
        );
    }
}

Filter.defaultProps = {
    disabled: false,
    label: '',
    placeholder: 'all'
};
