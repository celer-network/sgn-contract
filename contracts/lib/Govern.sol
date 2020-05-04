pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract Govern {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    enum ParamNames { INCREASE_RATE_WAIT_TIME }

    mapping(uint => uint) UIntStorage;
    mapping(uint => string) StringStorage;
    mapping(uint => address) AddressStorage;
    mapping(uint => bytes) BytesStorage;
    mapping(uint => bool) BooleanStorage;
    mapping(uint => int) IntStorage;

    function getUIntValue(uint record) public view returns (uint) {
        return UIntStorage[record];
    }

    function getStringValue(uint record) public view returns (string memory) {
        return StringStorage[record];
    }

    function getAddressValue(uint record) public view returns (address) {
        return AddressStorage[record];
    }

    function getBytesValue(uint record) public view returns (bytes memory) {
        return BytesStorage[record];
    }

    function getBooleanValue(uint record) public view returns (bool) {
        return BooleanStorage[record];
    }

    function getIntValue(uint record) public view returns (int) {
        return IntStorage[record];
    }

    function setUIntValue(uint record, uint value) private {
        UIntStorage[record] = value;
    }
    
    function setStringValue(uint record, string memory value) private {
        StringStorage[record] = value;
    }

    function setAddressValue(uint record, address value) private {
        AddressStorage[record] = value;
    }

    function setBytesValue(uint record, bytes memory value) private {
        BytesStorage[record] = value;
    }

    function setBooleanValue(uint record, bool value) private {
        BooleanStorage[record] = value;
    }
    
    function setIntValue(uint record, int value) private {
        IntStorage[record] = value;
    }
}