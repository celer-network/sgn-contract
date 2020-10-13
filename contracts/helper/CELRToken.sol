pragma solidity ^0.5.1;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/**
 * @title CELRToken
 * @notice A simple ERC20 Token as a mock CELR, where all tokens are pre-assigned to the creator.
 * Note they can later distribute these tokens as they wish using `transfer` and other
 * `ERC20` functions.
 */
contract CELRToken is ERC20 {
    string public name = "CelerToken";
    string public symbol = "CELR";
    uint8 public decimals = 18;
    uint256 constant public INITIAL_SUPPLY = 1e28;

    /**
     * @notice Constructor that gives msg.sender all of existing tokens.
     */
    constructor() public {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
