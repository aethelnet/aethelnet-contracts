const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deployed = require("../deployed_addresses.json");
    const snapshot = require("../voter_snapshot.json");

    console.log("Connecting to TheForge at", deployed.TheForge);
    const TheForge = await hre.ethers.getContractFactory("TheForge");
    const forge = await TheForge.attach(deployed.TheForge);

    const signers = await hre.ethers.getSigners();
    const proposer = signers[0];

    const title = process.env.PROPOSAL_TITLE || "AIP-01: Activate L2 Neural Governor";
    const description = process.env.PROPOSAL_DESC || "Proposal to bind LGNN continuous-time ODE weights to on-chain state verification.";
    const root = BigInt(snapshot.merkleRoot);

    console.log(`Creating proposal with Proposer: ${proposer.address}`);
    console.log(`Title: ${title}`);
    console.log(`Root:  ${root.toString()}`);

    const tx = await forge.connect(proposer).createProposalWithRoot(title, description, root);
    const receipt = await tx.wait();

    const nextId = await forge.nextProposalId();
    const proposalId = nextId - 1n;

    console.log(`Proposal #${proposalId} created! TX Hash: ${tx.hash}`);

    const prop = await forge.proposals(proposalId);
    console.log("On-Chain Verification:");
    console.log("- ID:             ", prop.id.toString());
    console.log("- Title:          ", prop.title);
    console.log("- Voter Merkle Root:", prop.voterMerkleRoot.toString());
    console.log("- For Votes:      ", prop.forVotes.toString());
    console.log("- Against Votes:  ", prop.againstVotes.toString());
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { main };
