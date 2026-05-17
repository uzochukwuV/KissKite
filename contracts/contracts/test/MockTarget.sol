// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockTarget {
    event Ping(address sender, uint256 value);

    bool public shouldFail;

    function setShouldFail(bool value) external {
        shouldFail = value;
    }

    function ping() external payable returns (bytes4) {
        if (shouldFail) revert("mock fail");
        emit Ping(msg.sender, msg.value);
        return this.ping.selector;
    }
}
