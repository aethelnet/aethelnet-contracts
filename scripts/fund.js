const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const tx = await deployer.sendTransaction({
    to: "0x1977574630C270986A7Fbe2c344785485578cCD3",
    value: hre.ethers.parseEther("100.0")
  });
  await tx.wait();
  console.log("Sent 100 ETH to 0x1977574630C270986A7Fbe2c344785485578cCD3");
}

main().catch(console.error);
