import React from 'react';
import _ from 'lodash';
import { Button, DatePicker, Form, Input, InputNumber } from 'antd';

import Select from './select';

const FormItem = Form.Item;

const defaultFormItemLayout = {
  labelCol: {
    sm: { span: 8 },
    xs: { span: 24 }
  },

  wrapperCol: {
    sm: { span: 16 },
    xs: { span: 24 }
  }
};

const buttonLayout = {
  wrapperCol: {
    sm: { span: 3, offset: 21 },
    xs: { span: 24 }
  }
};

const FIELD_MAP = {
  date: DatePicker,
  input: Input,
  number: InputNumber,
  text: Input.TextArea,
  select: Select
};

class CustomizeForm extends React.Component {
  handleSubmit = e => {
    const { form, onSubmit } = this.props;
    e.preventDefault();
    form.validateFields((err, values) => {
      if (!err) {
        onSubmit(values);
      }
    });
  };

  renderFormItems = () => {
    const { form, formItemLayout, items } = this.props;
    const { getFieldDecorator } = form;

    return _.map(items, item => {
      const {
        field = 'input',
        fieldOptions,
        initialValue,
        label,
        name,
        rules
      } = item;
      const Field = FIELD_MAP[field];
      const decoratorOptions = {
        initialValue,
        rules,
        getValueFromEvent(...args) {
          if (field === 'file') {
            return args[0].fileList;
          }

          const [e] = args;
          if (!e || !e.target) {
            return e;
          }

          const { target } = e;
          return target.type === 'checkbox' ? target.checked : target.value;
        }
      };

      return (
        <FormItem
          key={name}
          {...formItemLayout}
          label={!label ? _.capitalize(name) : label}
        >
          {getFieldDecorator(
            name,
            decoratorOptions
          )(<Field {...fieldOptions} />)}
        </FormItem>
      );
    });
  };

  render() {
    const { onSubmit, submitText } = this.props;
    return (
      <Form onSubmit={this.handleSubmit}>
        {this.renderFormItems()}
        {onSubmit !== _.noop && (
          <FormItem {...buttonLayout}>
            <Button htmlType="submit" type="primary">
              {submitText}
            </Button>
          </FormItem>
        )}
      </Form>
    );
  }
}

CustomizeForm.defaultProps = {
  formItemLayout: defaultFormItemLayout,
  onSubmit: _.noop,
  submitText: 'Save'
};

export default Form.create({
  onValuesChange(props, changedValues) {
    if (props.onValuesChange) {
      props.onValuesChange(changedValues);
    }
  }
})(CustomizeForm);
