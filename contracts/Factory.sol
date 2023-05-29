//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.8 <0.9.0;

import { Greeter } from "./Greeter.sol";

contract Factory {
   Greeter[] public greeterArray;

   function createNewGreeter(string memory _greeting) public {
     Greeter greeter = new Greeter(_greeting);
     greeterArray.push(greeter);
   }

   function gfSetter(uint256 _greeterIndex, string memory _greeting) public {
     Greeter(address(greeterArray[_greeterIndex])).setGreeting(_greeting);
   }

   function gfGetter(uint256 _greeterIndex) public view returns (string memory) {
    return Greeter(address(greeterArray[_greeterIndex])).greet();
   }
}