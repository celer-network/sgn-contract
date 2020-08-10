export default {
    namespace: 'SGN',

    state: {},

    effects: {},

    reducers: {
        save(state, action) {
            return { ...state, ...action.payload };
        }
    }
};
