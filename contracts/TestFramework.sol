// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.8 <0.9.0;

import { HederaResponseCodes } from "./HederaResponseCodes.sol";
import { SafeHTS } from "./SafeHTS.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract TestFramework is Ownable {

	event TestEvent (
		address indexed _sender,
		uint256 indexed _value,
		string _message
	);
	
	function checkAllowance(address _token, address _owner, address _spender) public returns (uint256 allowance) {
		allowance = SafeHTS.safeAllowance(_token, _owner, _spender);
	}

	function isApprovedForAllSerials(address _token, address _owner, address _spender) public returns (bool isApproved) {
		isApproved = SafeHTS.safeIsApprovedForAll(_token, _owner, _spender);
	}

	function checkAllowances(address[] memory _token, address[] memory _owner, address[] memory _spender) public returns (uint256[] memory allowances) {
		require(_token.length == _owner.length && _owner.length == _spender.length, "Arrays must be of equal length");
		allowances = new uint256[](_token.length);
		for (uint256 i = 0; i < _token.length; i++) {
			allowances[i] = SafeHTS.safeAllowance(_token[i], _owner[i], _spender[i]);
		}
	}
	
	function checkTokensApprovedForAllSerial(address[] memory _token, address[] memory _owner, address[] memory _spender) public returns (bool[] memory approvals) {
		require(_token.length == _owner.length && _owner.length == _spender.length, "Arrays must be of equal length");
		approvals = new bool[](_token.length);
		for (uint256 i = 0; i < _token.length; i++) {
			approvals[i] = SafeHTS.safeIsApprovedForAll(_token[i], _owner[i], _spender[i]);
		}
	}

	receive() external payable {
        emit TestEvent(
            msg.sender,
            msg.value,
            "Recieved Hbar"
        );
    }

    fallback() external payable {
        emit TestEvent(msg.sender, msg.value, "Fallback Called");
    }
}