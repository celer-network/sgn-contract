export default {
    namespace: 'DPoS',

    state: {},

    effects: {},

    reducers: {
        save(state, action) {
            return { ...state, ...action.payload };
        }
    }
};
