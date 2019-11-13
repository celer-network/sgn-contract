export default {
  namespace: 'Guard',

  state: {},

  effects: {},

  reducers: {
    save(state, action) {
      return { ...state, ...action.payload };
    }
  }
};
