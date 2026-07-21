const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("Not enough Sepolia ETH to deploy!");
    return;
  }

  const token = await hre.ethers.deployContract("AethelToken");
  await token.waitForDeployment();
  console.log("AethelToken deployed to:", await token.getAddress());

  const forge = await hre.ethers.deployContract("TheForge");
  await forge.waitForDeployment();
  console.log("TheForge deployed to:", await forge.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
