// Code generated by protoc-gen-sol. DO NOT EDIT.
// source: sgn.proto
pragma solidity ^0.5.0;
import "./Pb.sol";

library PbSgn {
    using Pb for Pb.Buffer;  // so we can call Pb funcs on Buffer obj

    struct PenaltyRequest {
        bytes penaltyInfo;   // tag: 1
        bytes[] sigs;   // tag: 2
    } // end struct PenaltyRequest

    function decPenaltyRequest(bytes memory raw) internal pure returns (PenaltyRequest memory m) {
        Pb.Buffer memory buf = Pb.fromBytes(raw);

        uint[] memory cnts = buf.cntTags(2);
        m.sigs = new bytes[](cnts[2]);
        cnts[2] = 0;  // reset counter for later use
        
        uint tag;
        Pb.WireType wire;
        while (buf.hasMore()) {
            (tag, wire) = buf.decKey();
            if (false) {} // solidity has no switch/case
            else if (tag == 1) {
                m.penaltyInfo = bytes(buf.decBytes());
            }
            else if (tag == 2) {
                m.sigs[cnts[2]] = bytes(buf.decBytes());
                cnts[2]++;
            }
            else { buf.skipValue(wire); } // skip value of unknown tag
        }
    } // end decoder PenaltyRequest

    struct PenaltyInfo {
        uint64 nonce;   // tag: 1
        uint64 expireTime;   // tag: 2
        Penalty[] penalties;   // tag: 3
    } // end struct PenaltyInfo

    function decPenaltyInfo(bytes memory raw) internal pure returns (PenaltyInfo memory m) {
        Pb.Buffer memory buf = Pb.fromBytes(raw);

        uint[] memory cnts = buf.cntTags(3);
        m.penalties = new Penalty[](cnts[3]);
        cnts[3] = 0;  // reset counter for later use
        
        uint tag;
        Pb.WireType wire;
        while (buf.hasMore()) {
            (tag, wire) = buf.decKey();
            if (false) {} // solidity has no switch/case
            else if (tag == 1) {
                m.nonce = uint64(buf.decVarint());
            }
            else if (tag == 2) {
                m.expireTime = uint64(buf.decVarint());
            }
            else if (tag == 3) {
                m.penalties[cnts[3]] = decPenalty(buf.decBytes());
                cnts[3]++;
            }
            else { buf.skipValue(wire); } // skip value of unknown tag
        }
    } // end decoder PenaltyInfo

    struct Penalty {
        address validatorAddress;   // tag: 1
        AccountAmtPair[] penalizedDelegators;   // tag: 2
        AccountAmtPair[] beneficiaries;   // tag: 3
    } // end struct Penalty

    function decPenalty(bytes memory raw) internal pure returns (Penalty memory m) {
        Pb.Buffer memory buf = Pb.fromBytes(raw);

        uint[] memory cnts = buf.cntTags(3);
        m.penalizedDelegators = new AccountAmtPair[](cnts[2]);
        cnts[2] = 0;  // reset counter for later use
        m.beneficiaries = new AccountAmtPair[](cnts[3]);
        cnts[3] = 0;  // reset counter for later use
        
        uint tag;
        Pb.WireType wire;
        while (buf.hasMore()) {
            (tag, wire) = buf.decKey();
            if (false) {} // solidity has no switch/case
            else if (tag == 1) {
                m.validatorAddress = Pb._address(buf.decBytes());
            }
            else if (tag == 2) {
                m.penalizedDelegators[cnts[2]] = decAccountAmtPair(buf.decBytes());
                cnts[2]++;
            }
            else if (tag == 3) {
                m.beneficiaries[cnts[3]] = decAccountAmtPair(buf.decBytes());
                cnts[3]++;
            }
            else { buf.skipValue(wire); } // skip value of unknown tag
        }
    } // end decoder Penalty

    struct AccountAmtPair {
        address account;   // tag: 1
        uint256 amt;   // tag: 2
    } // end struct AccountAmtPair

    function decAccountAmtPair(bytes memory raw) internal pure returns (AccountAmtPair memory m) {
        Pb.Buffer memory buf = Pb.fromBytes(raw);

        uint tag;
        Pb.WireType wire;
        while (buf.hasMore()) {
            (tag, wire) = buf.decKey();
            if (false) {} // solidity has no switch/case
            else if (tag == 1) {
                m.account = Pb._address(buf.decBytes());
            }
            else if (tag == 2) {
                m.amt = Pb._uint256(buf.decBytes());
            }
            else { buf.skipValue(wire); } // skip value of unknown tag
        }
    } // end decoder AccountAmtPair

}
