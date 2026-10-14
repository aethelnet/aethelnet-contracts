#!/usr/bin/env bash
set -e

CONTRACTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$CONTRACTS_DIR/.." && pwd)"

echo "[1/5] Starting Hardhat Node on :8545..."
tmux kill-session -t aethel_cluster 2>/dev/null || true
sleep 1

tmux new-session -d -s aethel_cluster -n EVM "cd \"$CONTRACTS_DIR\" && npx hardhat node --hostname 127.0.0.1 --port 8545"
sleep 3

echo "[2/5] Deploying TheForge & Verifier Contracts..."
cd "$CONTRACTS_DIR"
npx hardhat run scripts/deploy.js --network localhost

echo "[3/5] Registering P2P Nodes on TheForge..."
npx hardhat run scripts/register_nodes.js --network localhost

echo "[4/5] Generating Merkle Snapshot & On-Chain Proposal..."
node scripts/merkle_engine.js
npx hardhat run scripts/create_proposal.js --network localhost

echo "[5/5] Launching Aethelnet-Node (:8001) and Observer UI (:1420)..."
tmux new-window -t aethel_cluster:1 -n DAEMON "cd \"$ROOT_DIR/aethelnet-node\" && PORT=8001 PYTHONPATH=\"$ROOT_DIR/aethelnet-core:\$PYTHONPATH\" AETHELNET_AUTH_TOKEN=\"aethel_dev_token\" HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 uvicorn aethelnet_node.main:app --host 127.0.0.1 --port 8001"
tmux new-window -t aethel_cluster:2 -n OBSERVER "cd \"$ROOT_DIR/aethelnet-observer\" && npx vite preview --port 1420"

echo "Cluster boot triggered. Waiting for services to settle..."
sleep 6
echo "Cluster Boot Complete!"
