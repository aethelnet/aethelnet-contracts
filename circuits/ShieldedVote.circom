pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * ShieldedVote Circuit
 * Proves that a user knows a secret and a nullifier that generate a specific commitment.
 * The nullifierHash is exposed publicly so the contract can ensure the user only votes once.
 */
template ShieldedVote() {
    // Public inputs
    signal input commitment;       // The public identity/commitment registered in the contract
    signal input proposalId;       // The ID of the proposal being voted on
    signal input vote;             // The vote cast (e.g. 1 for YES, 0 for NO)

    // Private inputs
    signal input secret;           // The user's secret
    signal input nullifier;        // A unique random string/number to prevent double-voting

    // Public outputs
    signal output nullifierHash;   // Hash of (nullifier, proposalId) to prevent double voting on THIS proposal

    // 1. Verify that Hash(nullifier, secret) == commitment
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    commitment === commitmentHasher.out;

    // 2. Generate the Nullifier Hash to expose publicly
    // We mix the proposalId with the nullifier so the same nullifier can be used for different proposals,
    // but only ONCE per proposal.
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== proposalId;
    nullifierHash <== nullifierHasher.out;

    // We can also bind the vote to the circuit output or public inputs to ensure the proof
    // is tied to the specific vote cast, preventing front-running or tampering.
    // In SnarkJS, public inputs are bound to the proof inherently.
    signal voteSquare;
    voteSquare <== vote * vote; // Dummy constraint just to ensure vote is part of the circuit logic
}

component main {public [commitment, proposalId, vote]} = ShieldedVote();
