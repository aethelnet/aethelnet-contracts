// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BasePaymaster.sol";

interface ITheForge {
    function hasVotedShielded(uint256 proposalId, bytes32 nullifierHash) external view returns (bool);
}

contract AethelnetPaymaster is BasePaymaster {
    address public immutable theForge;

    bytes4 public constant EXECUTE_SELECTOR = 0xb61d27f6; // bytes4(keccak256("execute(address,uint256,bytes)"))
    bytes4 public constant REGISTER_NODE_SELECTOR = bytes4(keccak256("registerNode(string)"));
    bytes4 public constant VOTE_SHIELDED_SELECTOR = bytes4(keccak256("voteShielded(uint256,bool,uint256[2],uint256[2][2],uint256[2],uint256)"));

    // Anti-Sybil State
    mapping(address => uint256) public lastNodeRegistration;
    uint256 public constant REGISTRATION_COOLDOWN = 30 minutes;

    uint256 public globalDailyLimit = 0.5 ether;
    uint256 public globalSpentToday;
    uint256 public lastResetTime;

    constructor(IEntryPoint _entryPoint, address _theForge) BasePaymaster(_entryPoint) {
        require(_theForge != address(0), "Invalid TheForge address");
        theForge = _theForge;
        lastResetTime = block.timestamp;
    }

    function setDailyLimit(uint256 _limit) external onlyOwner {
        globalDailyLimit = _limit;
    }

    function resetCircuitBreaker() external onlyOwner {
        globalSpentToday = 0;
        lastResetTime = block.timestamp;
    }

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        // Circuit Breaker Reset
        if (block.timestamp > lastResetTime + 24 hours) {
            globalSpentToday = 0;
            lastResetTime = block.timestamp;
        }
        require(globalSpentToday + maxCost <= globalDailyLimit, "Paymaster: Circuit breaker daily limit exceeded");

        require(userOp.callData.length >= 4, "Paymaster: Invalid calldata length");
        bytes4 selector = bytes4(userOp.callData[0:4]);
        
        require(selector == EXECUTE_SELECTOR, "Paymaster: Only single execute() allowed");
        
        (address target, uint256 value, bytes memory data) = abi.decode(
            userOp.callData[4:], 
            (address, uint256, bytes)
        );
        
        require(target == theForge, "Paymaster: Target must be TheForge");
        require(value == 0, "Paymaster: No ETH transfers allowed");
        require(data.length >= 4, "Paymaster: Invalid inner calldata");
        
        bytes4 innerSelector = bytes4(data);
        require(
            innerSelector == REGISTER_NODE_SELECTOR || innerSelector == VOTE_SHIELDED_SELECTOR,
            "Paymaster: Target method not allowed"
        );

        if (innerSelector == REGISTER_NODE_SELECTOR) {
            // Heartbeat-Throttle
            require(
                block.timestamp >= lastNodeRegistration[userOp.sender] + REGISTRATION_COOLDOWN,
                "Paymaster: Sender rate limited for registerNode"
            );
            lastNodeRegistration[userOp.sender] = block.timestamp;
        } else if (innerSelector == VOTE_SHIELDED_SELECTOR) {
            uint256 proposalId;
            uint256 nullifierHash;
            assembly {
                // data is a bytes memory array. The first 32 bytes is length.
                // The actual payload starts at add(data, 0x20).
                // The 4-byte selector is at the beginning of the payload.
                // proposalId is right after the selector (4 bytes offset).
                // nullifierHash is 320 bytes after the selector (320 + 4 = 324 bytes offset).
                proposalId := mload(add(data, 0x24))
                nullifierHash := mload(add(data, 0x164))
            }
            bool alreadyVoted = ITheForge(theForge).hasVotedShielded(proposalId, bytes32(nullifierHash));
            require(!alreadyVoted, "Paymaster: ZK Nullifier already consumed");
        }

        // Deduct maxCost upfront, we will refund the unused part in _postOp
        globalSpentToday += maxCost;
        
        // Pass maxCost in context to refund accurately in _postOp
        return (abi.encode(maxCost), 0);
    }

    function _postOp(
        PostOpMode /* mode */,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) internal override {
        uint256 maxCost = abi.decode(context, (uint256));
        // Refund unused gas to the daily limit
        if (maxCost > actualGasCost) {
            globalSpentToday -= (maxCost - actualGasCost);
        }
    }
}
