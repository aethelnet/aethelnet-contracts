const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

class PoseidonMerkleTree {
    constructor(levels, poseidon) {
        this.levels = levels;
        this.poseidon = poseidon;
        this.F = poseidon.F;
        this.capacity = 1 << levels; // 1024 for levels = 10
        this.leaves = [];
    }

    hash(a, b) {
        return this.F.toObject(this.poseidon([BigInt(a), BigInt(b)]));
    }

    insert(leaf) {
        if (this.leaves.length >= this.capacity) {
            throw new Error("Tree is full");
        }
        const index = this.leaves.length;
        this.leaves.push(BigInt(leaf));
        return index;
    }

    getTreeLevels() {
        let currentLevel = [...this.leaves];
        while (currentLevel.length < this.capacity) {
            currentLevel.push(0n);
        }

        const tree = [currentLevel];
        for (let l = 0; l < this.levels; l++) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                nextLevel.push(this.hash(currentLevel[i], currentLevel[i + 1]));
            }
            tree.push(nextLevel);
            currentLevel = nextLevel;
        }
        return tree;
    }

    getRoot() {
        const tree = this.getTreeLevels();
        return tree[this.levels][0];
    }

    getProof(index) {
        const tree = this.getTreeLevels();
        const pathElements = [];
        const pathIndices = [];

        let curIdx = index;
        for (let l = 0; l < this.levels; l++) {
            const isRight = (curIdx % 2 === 1);
            pathIndices.push(isRight ? 1 : 0);
            const siblingIdx = isRight ? curIdx - 1 : curIdx + 1;
            pathElements.push(tree[l][siblingIdx].toString());
            curIdx = Math.floor(curIdx / 2);
        }

        return {
            root: tree[this.levels][0].toString(),
            pathElements,
            pathIndices
        };
    }
}

async function createMerkleSnapshot(votersList) {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;
    const tree = new PoseidonMerkleTree(10, poseidon);

    const voterDetails = [];

    for (let i = 0; i < votersList.length; i++) {
        const v = votersList[i];
        const secretBig = BigInt(v.secret);
        const nullifierBig = BigInt(v.nullifier);

        // Commitment: Poseidon(nullifier, secret)
        const commitment = F.toObject(poseidon([nullifierBig, secretBig]));
        const leafIndex = tree.insert(commitment);

        voterDetails.push({
            id: v.id,
            label: v.label,
            secret: secretBig.toString(),
            nullifier: nullifierBig.toString(),
            commitment: commitment.toString(),
            leafIndex: leafIndex
        });
    }

    const root = tree.getRoot().toString();

    // Attach Merkle proofs
    for (let i = 0; i < voterDetails.length; i++) {
        const proof = tree.getProof(voterDetails[i].leafIndex);
        voterDetails[i].proof = {
            pathElements: proof.pathElements,
            pathIndices: proof.pathIndices
        };
    }

    const snapshot = {
        treeDepth: 10,
        capacity: 1024,
        totalLeaves: voterDetails.length,
        merkleRoot: root,
        generatedAt: new Date().toISOString(),
        voters: voterDetails
    };

    return snapshot;
}

// Generate default snapshot for demo/testing
const DEFAULT_VOTERS = [
    { id: "voter-0", label: "Genesis Operator (Node 8001)", secret: "9876543210123", nullifier: "1122334455667" },
    { id: "voter-1", label: "Peer Node 2 (Node 8002)",     secret: "1234567890123", nullifier: "2233445566778" },
    { id: "voter-2", label: "Core Developer (DAO Seat)",   secret: "5556667778889", nullifier: "3344556677889" },
    { id: "voter-3", label: "Ecosystem Delegate Alpha",    secret: "9998887776665", nullifier: "4455667788990" },
    { id: "voter-4", label: "External Research Auditor",   secret: "7778889990001", nullifier: "5566778899001" }
];

async function main() {
    console.log("==================================================");
    console.log("       AETHELNET MERKLE SNAPSHOT GENERATOR       ");
    console.log("==================================================");

    const snapshot = await createMerkleSnapshot(DEFAULT_VOTERS);
    console.log("Tree Depth:       ", snapshot.treeDepth);
    console.log("Voter Count:      ", snapshot.totalLeaves);
    console.log("Merkle Root (Dec):", snapshot.merkleRoot);

    const contractsOut = path.join(__dirname, "../voter_snapshot.json");
    fs.writeFileSync(contractsOut, JSON.stringify(snapshot, null, 2));
    console.log("Saved to:", contractsOut);

    // Also export to observer frontend public dir
    const observerPublic = path.join(__dirname, "../../aethelnet-observer/public/voter_snapshot.json");
    try {
        fs.writeFileSync(observerPublic, JSON.stringify(snapshot, null, 2));
        console.log("Exported to Observer Public:", observerPublic);
    } catch (e) {
        console.warn("Could not copy to observer public:", e.message);
    }

    return snapshot;
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    PoseidonMerkleTree,
    createMerkleSnapshot,
    DEFAULT_VOTERS
};
