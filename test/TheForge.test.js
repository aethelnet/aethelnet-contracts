const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");

describe("TheForge Governance & ZK-Shielded Protocol", function () {
    let verifier, forge, token;
    let owner, voter1, voter2, attacker;
    let poseidon, F;

    const wasmPath = path.join(__dirname, "../circuits/build/ShieldedVote_js/ShieldedVote.wasm");
    const zkeyPath = path.join(__dirname, "../circuits/build/circuit_final.zkey");

    before(async function () {
        poseidon = await buildPoseidon();
        F = poseidon.F;
    });

    beforeEach(async function () {
        [owner, voter1, voter2, attacker] = await ethers.getSigners();

        // 1. Deploy Verifier
        const Verifier = await ethers.getContractFactory("Groth16Verifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();
        const verifierAddress = await verifier.getAddress();

        // 2. Deploy AethelToken
        const AethelToken = await ethers.getContractFactory("AethelToken");
        token = await AethelToken.deploy();
        await token.waitForDeployment();

        // 3. Deploy TheForge
        const TheForge = await ethers.getContractFactory("TheForge");
        forge = await TheForge.deploy(verifierAddress);
        await forge.waitForDeployment();
    });

    describe("Deployment & Initialization", function () {
        it("should link Groth16Verifier correctly to TheForge", async function () {
            expect(await forge.verifier()).to.equal(await verifier.getAddress());
        });

        it("should start with nextProposalId = 0", async function () {
            expect(await forge.nextProposalId()).to.equal(0n);
        });
    });

    describe("Proposal Lifecycle & Public Voting", function () {
        it("should create a proposal and emit ProposalCreated event", async function () {
            await expect(forge.createProposal("Protocol Upgrade v1.1", "Activate neural governor"))
                .to.emit(forge, "ProposalCreated")
                .withArgs(0n, "Protocol Upgrade v1.1", owner.address);

            const prop = await forge.proposals(0n);
            expect(prop.title).to.equal("Protocol Upgrade v1.1");
            expect(prop.proposer).to.equal(owner.address);
            expect(prop.forVotes).to.equal(0n);
            expect(prop.againstVotes).to.equal(0n);
        });

        it("should record public vote and prevent double-voting", async function () {
            await forge.createProposal("Proposal 0", "Test desc");

            // Vote once
            await expect(forge.connect(voter1).votePublic(0n, true))
                .to.emit(forge, "VotedPublic")
                .withArgs(0n, voter1.address, true);

            const prop = await forge.proposals(0n);
            expect(prop.forVotes).to.equal(100n);

            // Double vote attempt must revert
            await expect(forge.connect(voter1).votePublic(0n, true))
                .to.be.revertedWith("Already voted publicly");

            await expect(forge.connect(voter1).votePublic(0n, false))
                .to.be.revertedWith("Already voted publicly");
        });

        it("should revert if voting on non-existent proposal", async function () {
            await expect(forge.connect(voter1).votePublic(999n, true))
                .to.be.revertedWith("Proposal does not exist");
        });
    });

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
                pathElements.push(tree[l][siblingIdx]);
                curIdx = Math.floor(curIdx / 2);
            }

            return {
                root: tree[this.levels][0],
                pathElements,
                pathIndices
            };
        }
    }

    describe("ZK-Shielded Voting & Sybil Exploit Defense", function () {
        let tree;
        let secret, nullifier, proposalId, voteVal;
        let commitment, nullifierHash, voterMerkleRoot;
        let a, b, c;

        beforeEach(async function () {
            // 1. Build Merkle Tree with 10 levels
            tree = new PoseidonMerkleTree(10, poseidon);

            secret = 9876543210123n;
            nullifier = 1122334455667n;
            voteVal = 1n; // 1 = YES (Support)

            // Calculate commitment: Poseidon(nullifier, secret)
            const commitmentHash = poseidon([nullifier, secret]);
            commitment = F.toObject(commitmentHash);

            // Insert voter1 commitment at index 0
            tree.insert(commitment);

            // Insert another voter commitment at index 1
            const otherCommitment = F.toObject(poseidon([444444n, 555555n]));
            tree.insert(otherCommitment);

            voterMerkleRoot = tree.getRoot();

            // Create Proposal 0 with authorized voter Merkle root
            await forge.createProposalWithRoot("ZK Shielded Governance", "Vote privately", voterMerkleRoot);
            proposalId = 0n;

            // Generate proof for voter1 (index 0)
            const merkleProof = tree.getProof(0);

            const circuitInput = {
                root: voterMerkleRoot,
                proposalId: proposalId,
                vote: voteVal,
                secret: secret,
                nullifier: nullifier,
                pathElements: merkleProof.pathElements,
                pathIndices: merkleProof.pathIndices
            };

            const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

            nullifierHash = publicSignals[0];

            // Format coordinates for Solidity Groth16 Verifier
            a = [proof.pi_a[0], proof.pi_a[1]];
            b = [
                [proof.pi_b[0][1], proof.pi_b[0][0]],
                [proof.pi_b[1][1], proof.pi_b[1][0]]
            ];
            c = [proof.pi_c[0], proof.pi_c[1]];
        });

        it("Happy Path: should successfully verify ZK proof and record shielded vote", async function () {
            await expect(forge.connect(voter1).voteShielded(
                proposalId,
                true, // support = true
                a, b, c,
                nullifierHash
            ))
            .to.emit(forge, "VotedShielded")
            .withArgs(proposalId, nullifierHash, true);

            const prop = await forge.proposals(proposalId);
            expect(prop.forVotes).to.equal(100n);
            expect(prop.againstVotes).to.equal(0n);
        });

        it("EXPLOIT 1 (Double-Spend / Replay): should revert when same nullifierHash is used twice", async function () {
            // First vote passes
            await forge.connect(voter1).voteShielded(
                proposalId,
                true,
                a, b, c,
                nullifierHash
            );

            // Replay attack with same nullifierHash must revert
            await expect(forge.connect(attacker).voteShielded(
                proposalId,
                true,
                a, b, c,
                nullifierHash
            )).to.be.revertedWith("Nullifier already used");
        });

        it("EXPLOIT 2 (Proof Manipulation / Vote Flipping): should revert if on-chain support differs from ZK proof", async function () {
            // Proof was generated for voteVal = 1 (Support = YES).
            // Attacker tries to submit proof with support = false (NO).
            await expect(forge.connect(attacker).voteShielded(
                proposalId,
                false, // Flipped vote!
                a, b, c,
                nullifierHash
            )).to.be.revertedWith("Invalid ZK Proof");
        });

        it("EXPLOIT 3 (Cross-Proposal Replay): should revert if proof for proposal 0 is used on proposal 1", async function () {
            await forge.createProposalWithRoot("Proposal 1", "Second proposal", voterMerkleRoot);
            const proposalId1 = 1n;

            await expect(forge.connect(attacker).voteShielded(
                proposalId1, // Different proposal!
                true,
                a, b, c,
                nullifierHash
            )).to.be.revertedWith("Invalid ZK Proof");
        });

        it("EXPLOIT 4 (Sybil Attack / Unauthorized Root): should revert if proof was forged using a fake Merkle root", async function () {
            // Attacker creates their own private tree containing their unauthorized commitment
            const attackerTree = new PoseidonMerkleTree(10, poseidon);
            const attackerSecret = 666666n;
            const attackerNullifier = 777777n;
            const attackerCommitment = F.toObject(poseidon([attackerNullifier, attackerSecret]));
            attackerTree.insert(attackerCommitment);
            const attackerRoot = attackerTree.getRoot();

            const attackerProofData = attackerTree.getProof(0);

            // Attacker generates a valid proof for THEIR tree root
            const attackerInput = {
                root: attackerRoot,
                proposalId: proposalId,
                vote: 1n,
                secret: attackerSecret,
                nullifier: attackerNullifier,
                pathElements: attackerProofData.pathElements,
                pathIndices: attackerProofData.pathIndices
            };

            const { proof: aProof, publicSignals: aPub } = await snarkjs.groth16.fullProve(attackerInput, wasmPath, zkeyPath);
            const a_a = [aProof.pi_a[0], aProof.pi_a[1]];
            const a_b = [
                [aProof.pi_b[0][1], aProof.pi_b[0][0]],
                [aProof.pi_b[1][1], aProof.pi_b[1][0]]
            ];
            const a_c = [aProof.pi_c[0], aProof.pi_c[1]];

            // Attacker tries to submit this proof to Proposal 0 (which requires voterMerkleRoot)
            // TheForge passes proposal's voterMerkleRoot to Verifier -> Verifier must REJECT!
            await expect(forge.connect(attacker).voteShielded(
                proposalId,
                true,
                a_a, a_b, a_c,
                aPub[0] // attacker nullifierHash
            )).to.be.revertedWith("Invalid ZK Proof");
        });

        it("EXPLOIT 5 (Sybil Attack / Fake Path against Real Root): should fail witness generation if commitment is not in tree", async function () {
            const attackerSecret = 999999n;
            const attackerNullifier = 888888n;
            const fakeProof = tree.getProof(0); // Sibling path for index 0

            const invalidCircuitInput = {
                root: voterMerkleRoot,
                proposalId: proposalId,
                vote: 1n,
                secret: attackerSecret, // Attacker's secret doesn't match leaf 0
                nullifier: attackerNullifier,
                pathElements: fakeProof.pathElements,
                pathIndices: fakeProof.pathIndices
            };

            let witnessFailed = false;
            try {
                await snarkjs.groth16.fullProve(invalidCircuitInput, wasmPath, zkeyPath);
            } catch (err) {
                witnessFailed = true;
            }
            expect(witnessFailed).to.be.true;
        });
    });

    describe("P2P Node Registry", function () {
        it("should register P2P node and return active nodes", async function () {
            const ip = "192.168.1.100:8000";

            await expect(forge.connect(voter1).registerNode(ip))
                .to.emit(forge, "NodeRegistered")
                .withArgs(voter1.address, ip);

            expect(await forge.registeredPeers(0n)).to.equal(voter1.address);

            const peerData = await forge.peerRegistry(voter1.address);
            expect(peerData.ipAddress).to.equal(ip);
            expect(peerData.isActive).to.be.true;
            expect(peerData.lastSeen).to.be.gt(0n);

            const activeNodes = await forge.getActiveNodes();
            expect(activeNodes.length).to.equal(1);
            expect(activeNodes[0]).to.equal(ip);
        });

        it("should update lastSeen when node re-registers (heartbeat)", async function () {
            await forge.connect(voter1).registerNode("10.0.0.1:8000");
            const nodeBefore = await forge.peerRegistry(voter1.address);

            // Wait 2 seconds
            await ethers.provider.send("evm_increaseTime", [2]);
            await ethers.provider.send("evm_mine");

            await forge.connect(voter1).registerNode("10.0.0.1:8000");
            const nodeAfter = await forge.peerRegistry(voter1.address);

            expect(nodeAfter.lastSeen).to.be.gt(nodeBefore.lastSeen);
        });
    });
});
