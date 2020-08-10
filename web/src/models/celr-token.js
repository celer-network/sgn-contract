export default {
    namespace: 'CELRToken',

    state: {},

    effects: {},

    reducers: {
        save(state, action) {
            return { ...state, ...action.payload };
        }
    }
};
