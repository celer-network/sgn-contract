const SETTING_KEY = 'setting';

export default {
  namespace: 'network',

  state: {
    setting: JSON.parse(localStorage.getItem(SETTING_KEY)) || {
      gateway: `${window.location.protocol}//${window.location.hostname}/gateway`
    }
  },

  effects: {
    *saveSetting({ payload }, { put }) {
      const { setting } = payload;
      localStorage.setItem(SETTING_KEY, JSON.stringify(setting));

      yield put({ payload, type: 'save' });
    }
  },

  reducers: {
    save(state, action) {
      return { ...state, ...action.payload };
    }
  }
};
