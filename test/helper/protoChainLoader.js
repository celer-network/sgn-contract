const protobuf = require("protobufjs");
protobuf.common("google/protobuf/descriptor.proto", {})

module.exports = async () => {
    sgn = await protobuf.load(`${__dirname}/../../contracts/lib/data/proto/sgn.proto`);

    const PenaltyRequest = sgn.lookupType("sgn.PenaltyRequest");
    const PenaltyInfo = sgn.lookupType("sgn.PenaltyInfo");
    const Penalty = sgn.lookupType("sgn.Penalty");
    const AccountAmtPair = sgn.lookupType("sgn.AccountAmtPair");

    return {
        PenaltyRequest,
        PenaltyInfo,
        Penalty,
        AccountAmtPair
    }
}
