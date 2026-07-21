// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

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

    uint256 public nextProposalId;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVotedPublic;
    mapping(uint256 => mapping(bytes32 => bool)) public hasVotedShielded;

    event ProposalCreated(uint256 id, string title, address proposer);
    event VotedPublic(uint256 id, address voter, bool support);
    event VotedShielded(uint256 id, bytes32 zkProofHash, bool support);

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

    function voteShielded(uint256 proposalId, bool support, bytes32 zkProofHash) public {
        require(proposalId < nextProposalId, "Proposal does not exist");
        require(!hasVotedShielded[proposalId][zkProofHash], "Proof already used");
        
        hasVotedShielded[proposalId][zkProofHash] = true;
        
        if (support) {
            proposals[proposalId].forVotes += 100; // Mock voting power
        } else {
            proposals[proposalId].againstVotes += 100;
        }
        
        emit VotedShielded(proposalId, zkProofHash, support);
    }
}
