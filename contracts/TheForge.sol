// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "./Verifier.sol";

contract TheForge {
    struct Proposal {
        uint256 id;
        string title;
        string description;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        uint256 endTime;
        address proposer;
    }

    struct PeerNode {
        string ipAddress;
        uint256 lastSeen;
        bool isActive;
    }

    uint256 public nextProposalId;
    Groth16Verifier public verifier;
    
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVotedPublic;
    mapping(uint256 => mapping(bytes32 => bool)) public hasVotedShielded;

    // P2P Registry
    mapping(address => PeerNode) public peerRegistry;
    address[] public registeredPeers;

    event ProposalCreated(uint256 id, string title, address proposer);
    event VotedPublic(uint256 id, address voter, bool support);
    event VotedShielded(uint256 id, uint256 nullifierHash, bool support);
    event NodeRegistered(address owner, string ipAddress);

    constructor(address _verifier) {
        verifier = Groth16Verifier(_verifier);
    }

    function createProposal(string memory title, string memory description) public {
        uint256 id = nextProposalId++;
        proposals[id] = Proposal({
            id: id,
            title: title,
            description: description,
            forVotes: 0,
            againstVotes: 0,
            executed: false,
            endTime: block.timestamp + 7 days,
            proposer: msg.sender
        });
        emit ProposalCreated(id, title, msg.sender);
    }

    function votePublic(uint256 proposalId, bool support) public {
        require(proposalId < nextProposalId, "Proposal does not exist");
        require(!hasVotedPublic[proposalId][msg.sender], "Already voted publicly");
        
        hasVotedPublic[proposalId][msg.sender] = true;
        
        if (support) {
            proposals[proposalId].forVotes += 100; // Mock voting power
        } else {
            proposals[proposalId].againstVotes += 100;
        }
        
        emit VotedPublic(proposalId, msg.sender, support);
    }

    // ZK Shielded Vote
    function voteShielded(
        uint256 proposalId, 
        bool support, 
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint256 nullifierHash,
        uint256 commitment
    ) public {
        require(proposalId < nextProposalId, "Proposal does not exist");
        require(!hasVotedShielded[proposalId][bytes32(nullifierHash)], "Nullifier already used");
        
        uint256 voteVal = support ? 1 : 0;
        
        // input = [nullifierHash, commitment, proposalId, vote]
        uint[4] memory publicInputs = [nullifierHash, commitment, proposalId, voteVal];
        
        require(verifier.verifyProof(a, b, c, publicInputs), "Invalid ZK Proof");

        // Mark this nullifier as used for this specific proposal
        hasVotedShielded[proposalId][bytes32(nullifierHash)] = true;
        
        if (support) {
            proposals[proposalId].forVotes += 100; // Mock fixed voting power for anonymity
        } else {
            proposals[proposalId].againstVotes += 100;
        }
        
        emit VotedShielded(proposalId, nullifierHash, support);
    }

    // --- P2P Registry Methods ---
    function registerNode(string memory ipAddress) public {
        if (peerRegistry[msg.sender].lastSeen == 0) {
            // New node
            registeredPeers.push(msg.sender);
        }
        
        peerRegistry[msg.sender] = PeerNode({
            ipAddress: ipAddress,
            lastSeen: block.timestamp,
            isActive: true
        });
        
        emit NodeRegistered(msg.sender, ipAddress);
    }

    function getActiveNodes() public view returns (string[] memory) {
        uint256 activeCount = 0;
        
        // First pass: count active nodes (seen in the last 24 hours)
        for (uint i = 0; i < registeredPeers.length; i++) {
            if (peerRegistry[registeredPeers[i]].isActive && 
                block.timestamp - peerRegistry[registeredPeers[i]].lastSeen < 24 hours) {
                activeCount++;
            }
        }
        
        // Second pass: collect IPs
        string[] memory ips = new string[](activeCount);
        uint256 currentIndex = 0;
        
        for (uint i = 0; i < registeredPeers.length; i++) {
            PeerNode memory node = peerRegistry[registeredPeers[i]];
            if (node.isActive && block.timestamp - node.lastSeen < 24 hours) {
                ips[currentIndex] = node.ipAddress;
                currentIndex++;
            }
        }
        
        return ips;
    }
}
