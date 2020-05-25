export default {
  namespace: 'DPoS',

  state: {},

  effects: {},

  reducers: {
    addProposal(state, action) {
      return {
        ...state,
        proposals: [...(state.proposals || []), action.payload.proposal],
      };
    },
    save(state, action) {
      return { ...state, ...action.payload };
    },
  },
};
