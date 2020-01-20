pragma solidity ^0.5.1;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract CELRToken is ERC20 {
    string public name = "CelerToken";
    string public symbol = "CELR";
    uint8 public decimals = 18;
    uint public INITIAL_SUPPLY = 1e28;

    constructor() public {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
