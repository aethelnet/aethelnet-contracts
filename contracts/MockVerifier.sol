// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockVerifier {
    function verifyProof(uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[4] calldata) public pure returns (bool) {
        return true; // Always valid for testing anti-sybil mechanics
    }
}
