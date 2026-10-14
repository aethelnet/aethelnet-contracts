#!/bin/bash
set -e

echo "1. Creating build directory..."
mkdir -p circuits/build

echo "2. Compiling ShieldedVote.circom..."
circom circuits/ShieldedVote.circom --r1cs --wasm --sym -o circuits/build/

echo "3. Starting Powers of Tau (Trusted Setup Phase 1)..."
npx snarkjs powersoftau new bn128 14 circuits/build/pot14_0000.ptau -v
npx snarkjs powersoftau contribute circuits/build/pot14_0000.ptau circuits/build/pot14_0001.ptau --name="First contribution" -v -e="EntropySource42"
npx snarkjs powersoftau prepare phase2 circuits/build/pot14_0001.ptau circuits/build/pot14_final.ptau -v

echo "4. Generating ZKey (Trusted Setup Phase 2)..."
npx snarkjs groth16 setup circuits/build/ShieldedVote.r1cs circuits/build/pot14_final.ptau circuits/build/circuit_0000.zkey
npx snarkjs zkey contribute circuits/build/circuit_0000.zkey circuits/build/circuit_final.zkey --name="Second contribution" -v -e="MoreEntropy734"
npx snarkjs zkey export verificationkey circuits/build/circuit_final.zkey circuits/build/verification_key.json

echo "5. Generating Solidity Verifier Contract..."
npx snarkjs zkey export solidityverifier circuits/build/circuit_final.zkey contracts/Verifier.sol

echo "Done! Verifier.sol has been created in the contracts/ directory."
