const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

class PoseidonMerkleTree {
    constructor(levels, leaves, poseidon) {
        this.levels = levels;
        this.poseidon = poseidon;
        this.F = poseidon.F;
        
        let currentLevel = leaves.map(l => BigInt(l));
        
        // Pad leaves to 2^levels
        const totalLeaves = 2 ** levels;
        while (currentLevel.length < totalLeaves) {
            currentLevel.push(0n);
        }
        
        this.tree = [currentLevel];
        
        for (let i = 0; i < levels; i++) {
            let nextLevel = [];
            for (let j = 0; j < currentLevel.length; j += 2) {
                const left = currentLevel[j];
                const right = currentLevel[j + 1];
                const hash = this.poseidon([left, right]);
                nextLevel.push(this.F.toObject(hash));
            }
            this.tree.push(nextLevel);
            currentLevel = nextLevel;
        }
    }
    
    get root() {
        return this.tree[this.levels][0];
    }
}

async function main() {
    console.log("=== Vektor B: Governance Dynamik (Poseidon Merkle Snapshot) ===");
    const poseidon = await buildPoseidon();
    
    const registryPath = path.join(__dirname, "../voter_registry.json");
    if (!fs.existsSync(registryPath)) {
        throw new Error("voter_registry.json not found!");
    }
    
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const authorizedLeaves = [];
    
    console.log("1. Checking ETH balances for registered voters on Sepolia...");
    for (const [address, commitment] of Object.entries(registry)) {
        const balance = await hre.ethers.provider.getBalance(address);
        if (balance > 0n) {
            console.log(`[PASS] ${address} - Balance: ${hre.ethers.formatEther(balance)} ETH`);
            authorizedLeaves.push(commitment);
        } else {
            console.log(`[FAIL] ${address} - Insufficient balance.`);
        }
    }
    
    if (authorizedLeaves.length === 0) {
        throw new Error("No authorized voters found with positive balance.");
    }
    
    console.log(`\n2. Assembling Poseidon Merkle Tree (Depth 10) with ${authorizedLeaves.length} leaves...`);
    const tree = new PoseidonMerkleTree(10, authorizedLeaves, poseidon);
    const merkleRoot = tree.root;
    console.log(`Computed Merkle Root: ${merkleRoot.toString()}`);
    
    console.log("\n3. Injecting Merkle Root into TheForge.sol...");
    const deployed = require("../deployed_addresses.json");
    const TheForge = await hre.ethers.getContractFactory("TheForge");
    const forge = await TheForge.attach(deployed.TheForge);
    
    const signers = await hre.ethers.getSigners();
    const proposer = signers[0];
    
    const title = "AIP-02: Dynamic Epoch V1";
    const description = "Automated snapshot generation via Native ETH balance indexing.";
    
    const tx = await forge.connect(proposer).createProposalWithRoot(title, description, merkleRoot);
    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    
    const nextId = await forge.nextProposalId();
    const proposalId = nextId - 1n;
    
    console.log(`\n=== SUCCESS ===`);
    console.log(`Proposal #${proposalId.toString()} created with dynamic root!`);
    console.log(`TX Hash: ${tx.hash}`);
    console.log(`Block:   ${receipt.blockNumber}`);
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
