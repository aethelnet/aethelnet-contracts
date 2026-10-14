const hre = require("hardhat");

async function main() {
  const [sender] = await hre.ethers.getSigners();
  const receiver = "0x1977574630c270986a7fbe2c344785485578ccd3";
  
  console.log(`Funding ${receiver} from ${sender.address}...`);
  
  const tx = await sender.sendTransaction({
    to: receiver,
    value: hre.ethers.parseEther("100.0")
  });
  
  await tx.wait();
  console.log("Successfully sent 100 ETH to the user wallet!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
