//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.8 <0.9.0;

contract Greeter {
    string private greeting;

	event GreeterEvent(string _old, string _new);

    constructor(string memory _greeting) {
		emit GreeterEvent(greeting, _greeting);
        greeting = _greeting;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
		emit GreeterEvent(greeting, _greeting);
        greeting = _greeting;
    }
}