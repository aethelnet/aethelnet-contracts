const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("Not enough balance to deploy!");
    return;
  }

  // 1. Deploy Verifier (Groth16Verifier from Verifier.sol)
  console.log("Deploying Groth16Verifier...");
  const verifier = await hre.ethers.deployContract("Groth16Verifier");
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddress);

  // 2. Deploy TheForge with verifierAddress dependency
  console.log("Deploying TheForge...");
  const forge = await hre.ethers.deployContract("TheForge", [verifierAddress]);
  await forge.waitForDeployment();
  const forgeAddress = await forge.getAddress();
  console.log("TheForge deployed to:", forgeAddress);

  // 3. Deploy AethelnetPaymaster
  console.log("Deploying AethelnetPaymaster...");
  // Standard ERC-4337 EntryPoint v0.6/v0.7 address
  const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const paymaster = await hre.ethers.deployContract("AethelnetPaymaster", [ENTRY_POINT, forgeAddress]);
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("AethelnetPaymaster deployed to:", paymasterAddress);

  // 4. Deposit 0.02 ETH to the Paymaster via deposit()
  console.log("Depositing 0.02 ETH into Paymaster...");
  const depositAmount = hre.ethers.parseEther("0.02");
  const depositTx = await paymaster.deposit({ value: depositAmount });
  await depositTx.wait();
  console.log("0.02 ETH successfully deposited to the Paymaster.");

  // Save to deployed_addresses.json
  const deployed = {
    network: hre.network.name,
    Groth16Verifier: verifierAddress,
    TheForge: forgeAddress,
    AethelnetPaymaster: paymasterAddress,
    EntryPoint: ENTRY_POINT,
    deployedAt: new Date().toISOString()
  };
  const outPath = path.join(__dirname, "../deployed_addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(deployed, null, 2));
  console.log("Saved deployment manifest to:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
