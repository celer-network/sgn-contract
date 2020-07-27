const protobuf = require('protobufjs');
protobuf.common('google/protobuf/descriptor.proto', {});

module.exports = async () => {
    const sgn = await protobuf.load(
        `${__dirname}/../../contracts/lib/data/proto/sgn.proto`
    );

    const PenaltyRequest = sgn.lookupType('sgn.PenaltyRequest');
    const RewardRequest = sgn.lookupType('sgn.RewardRequest');
    const Penalty = sgn.lookupType('sgn.Penalty');
    const Reward = sgn.lookupType('sgn.Reward');
    const AccountAmtPair = sgn.lookupType('sgn.AccountAmtPair');

    return {
        PenaltyRequest,
        RewardRequest,
        Penalty,
        Reward,
        AccountAmtPair
    };
};
