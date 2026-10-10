const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
// The bundler pays gas from the SEPOLIA_PRIVATE_KEY wallet, so do not let arbitrary websites call it.
// Allow browser origins explicitly via BUNDLER_CORS_ORIGINS="http://localhost:5173,https://example.org".
const corsOrigins = (process.env.BUNDLER_CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
if (corsOrigins.length) app.use(cors({ origin: corsOrigins }));
app.use(express.json());

const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const provider = new ethers.JsonRpcProvider(rpcUrl);
const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
if (!privateKey) {
    console.error("SEPOLIA_PRIVATE_KEY is not set. Put it in .env (see .env.example); never hard-code it.");
    process.exit(1);
}
const wallet = new ethers.Wallet(privateKey, provider);

const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const entryPointAbi = ["function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)"];
const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, entryPointAbi, wallet);

app.post('/rpc', async (req, res) => {
    if (req.body.method === 'eth_sendUserOperation') {
        try {
            console.log("Received UserOp:", req.body.params[0]);
            const userOp = req.body.params[0];
            
            // Format for ethers
            const formattedOp = {
                sender: userOp.sender,
                nonce: userOp.nonce,
                initCode: userOp.initCode || "0x",
                callData: userOp.callData,
                accountGasLimits: userOp.accountGasLimits,
                preVerificationGas: userOp.preVerificationGas,
                gasFees: userOp.gasFees,
                paymasterAndData: userOp.paymasterAndData || "0x",
                signature: userOp.signature
            };

            const tx = await entryPoint.handleOps([formattedOp], wallet.address);
            console.log("Submitted handleOps tx:", tx.hash);
            
            // Wait for confirmation to provide a safe return
            await tx.wait();
            
            // UserOp hash is usually returned, we just return the tx hash as a mock userOpHash for now
            res.json({ jsonrpc: "2.0", id: req.body.id, result: tx.hash });
        } catch (error) {
            console.error("Error submitting UserOp:", error);
            res.json({ jsonrpc: "2.0", id: req.body.id, error: { code: -32603, message: error.message } });
        }
    } else if (req.body.method === 'eth_supportedEntryPoints') {
        res.json({ jsonrpc: "2.0", id: req.body.id, result: [ENTRY_POINT_ADDRESS] });
    } else if (req.body.method === 'eth_chainId') {
        res.json({ jsonrpc: "2.0", id: req.body.id, result: "0xaa36a7" }); // Sepolia
    } else {
        res.json({ jsonrpc: "2.0", id: req.body.id, error: { code: -32601, message: "Method not found" } });
    }
});

// Bind to localhost by default: anyone who can reach this port can spend the wallet's gas.
const HOST = process.env.BUNDLER_HOST || "127.0.0.1";
const PORT = Number(process.env.BUNDLER_PORT || 3000);
app.listen(PORT, HOST, () => {
    console.log(`Micro-Bundler running on http://${HOST}:${PORT}/rpc`);
});
