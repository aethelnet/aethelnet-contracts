const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const buildPoseidon = require("circomlibjs").buildPoseidon;

async function main() {
    console.log("1. Initializing Poseidon Hash...");
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // 2. Setup user's private data
    const secret = 123456789n; // User's private secret
    const nullifier = 987654321n; // User's unique voting nullifier
    const proposalId = 0n;
    const voteVal = 1n; // 1 for YES

    console.log("2. Calculating Public Commitment...");
    const commitmentHash = poseidon([nullifier, secret]);
    const commitment = F.toObject(commitmentHash);

    console.log(`   Commitment generated: ${commitment}`);

    // 3. Deploy Contracts
    console.log("3. Deploying Contracts...");
    const [owner, voter] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();

    const TheForge = await ethers.getContractFactory("TheForge");
    const forge = await TheForge.deploy(verifierAddress);
    await forge.waitForDeployment();
    const forgeAddress = await forge.getAddress();

    console.log(`   TheForge deployed to: ${forgeAddress}`);

    // 4. Create Proposal
    console.log("4. Creating Proposal 0...");
    await forge.createProposal("Deploy Sovereign AI to Mainnet", "Should we activate the Skynet protocol?");

    // 5. Generate ZK Proof Off-Chain
    console.log("5. Generating ZK Proof Off-Chain (SnarkJS)...");
    const input = {
        commitment: commitment,
        proposalId: proposalId,
        vote: voteVal,
        secret: secret,
        nullifier: nullifier
    };

    const wasmFile = "./circuits/build/ShieldedVote_js/ShieldedVote.wasm";
    const zkeyFile = "./circuits/build/circuit_final.zkey";

    let proof, publicSignals;
    try {
        const result = await snarkjs.groth16.fullProve(input, wasmFile, zkeyFile);
        proof = result.proof;
        publicSignals = result.publicSignals;
    } catch (e) {
        console.error("Proof generation failed:", e);
        process.exit(1);
    }

    const nullifierHash = publicSignals[0]; // Output comes first
    console.log(`   Proof generated successfully! NullifierHash: ${nullifierHash}`);

    // Format proof for Solidity
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];

    // 6. Submit Vote On-Chain
    console.log("6. Submitting Shielded Vote On-Chain...");
    try {
        const tx = await forge.connect(voter).voteShielded(
            proposalId,
            true, // support = true
            a, b, c,
            nullifierHash,
            commitment
        );
        await tx.wait();
        console.log("   ✅ Vote successfully recorded on-chain using ZK Proof!");
    } catch (e) {
        console.error("   ❌ Vote transaction failed:", e.reason || e.message);
    }

    // 7. Verify Vote Count
    const proposalData = await forge.proposals(proposalId);
    console.log(`\nFinal Tally for Proposal 0:`);
    console.log(`FOR: ${proposalData.forVotes}`);
    console.log(`AGAINST: ${proposalData.againstVotes}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
