const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // Official EntryPoint v0.7.0 on Sepolia
    const ENTRY_POINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

    // 1. Deploy Verifier
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("Groth16Verifier deployed to:", verifierAddress);

    // 2. Deploy TheForge
    const TheForge = await ethers.getContractFactory("TheForge");
    const theForge = await TheForge.deploy(verifierAddress);
    await theForge.waitForDeployment();
    const theForgeAddress = await theForge.getAddress();
    console.log("TheForge deployed to:", theForgeAddress);

    // 3. Deploy Paymaster
    const Paymaster = await ethers.getContractFactory("AethelnetPaymaster");
    const paymaster = await Paymaster.deploy(ENTRY_POINT_ADDRESS, theForgeAddress);
    await paymaster.waitForDeployment();
    const paymasterAddress = await paymaster.getAddress();
    console.log("AethelnetPaymaster deployed to:", paymasterAddress);

    // 4. Fund Paymaster with 0.03 Sepolia ETH
    console.log("Funding Paymaster with 0.03 Sepolia ETH...");
    const tx = await paymaster.deposit({ value: ethers.parseEther("0.03") });
    await tx.wait();
    console.log("Paymaster funded successfully.");

    console.log("\n--- DEPLOYMENT COMPLETE ---");
    console.log("Verifier:", verifierAddress);
    console.log("TheForge:", theForgeAddress);
    console.log("Paymaster:", paymasterAddress);
    console.log("---------------------------\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
