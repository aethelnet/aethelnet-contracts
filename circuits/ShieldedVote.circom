pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

/*
 * ShieldedVote Circuit with Sybil Resistance via Merkle Tree Inclusion
 *
 * Proves:
 * 1. Knowledge of secret and nullifier such that commitment = Poseidon(nullifier, secret)
 * 2. That commitment exists in a binary Merkle Tree with root `root` (depth: levels)
 * 3. Calculates nullifierHash = Poseidon(nullifier, proposalId) to prevent double voting
 * 4. Binds the vote (0 or 1) to the proof
 */
template ShieldedVote(levels) {
    // Public inputs
    signal input root;             // The Merkle tree root of eligible voters
    signal input proposalId;       // The ID of the proposal being voted on
    signal input vote;             // The vote cast (e.g. 1 for YES, 0 for NO)

    // Private inputs
    signal input secret;           // The user's secret
    signal input nullifier;        // A unique random string/number to prevent double-voting
    signal input pathElements[levels]; // Merkle proof sibling hashes
    signal input pathIndices[levels];  // Merkle proof directions (0: current is left, 1: current is right)

    // Public outputs
    signal output nullifierHash;   // Hash of (nullifier, proposalId) to prevent double voting on THIS proposal

    // Ensure vote is binary (0 or 1)
    vote * (1 - vote) === 0;

    // 1. Calculate leaf commitment: Poseidon(nullifier, secret)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    signal leaf;
    leaf <== commitmentHasher.out;

    // 2. Verify Merkle Proof of Inclusion
    component switchers[levels];
    component hashers[levels];
    signal currentHash[levels + 1];
    currentHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Enforce pathIndices is binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        switchers[i] = Switcher();
        switchers[i].sel <== pathIndices[i];
        switchers[i].L <== currentHash[i];
        switchers[i].R <== pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;

        currentHash[i + 1] <== hashers[i].out;
    }

    // Verify computed root matches expected public root
    root === currentHash[levels];

    // 3. Generate the Nullifier Hash to expose publicly
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== proposalId;
    nullifierHash <== nullifierHasher.out;
}

component main {public [root, proposalId, vote]} = ShieldedVote(10);
