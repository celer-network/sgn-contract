export default {
  namespace: 'network',

  state: {},

  effects: {},

  reducers: {
    save(state, action) {
      return { ...state, ...action.payload };
    }
  }
};
