import React from 'react';
import { Select } from 'antd';
import _ from 'lodash';

const Option = Select.Option;

export default class extends React.Component {
    defaultProps = {
        allowClear: true,
        disabled: false,
        optionFilterProp: 'children',
        placeholder: ''
    };

    state = { value: undefined };

    onChange = (value: ValueType) => this.setState({ value });

    getValue = () => {
        const { defaultValue } = this.props;
        const { value } = this.state;
        return value || defaultValue;
    };

    renderOptions = () => {
        const { options } = this.props;
        return _.map(options, ([value, text]) => (
            <Option key={value} value={value}>
                {text}
            </Option>
        ));
    };

    render() {
        const { defaultValue } = this.props;
        const props = {
            ..._.omit(this.props, ['options', 'defaultValue'])
        };

        if (!props.onChange) {
            props.onChange = this.onChange;
        }
        if (!_.isNil(defaultValue)) {
            props.defaultValue = defaultValue;
        }

        return (
            <Select {...props} showSearch={true}>
                {this.renderOptions()}
            </Select>
        );
    }
}
