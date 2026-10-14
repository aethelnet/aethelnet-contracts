const hre = require("hardhat");

async function main() {
    const deployed = require("../deployed_addresses.json");
    const forgeAddress = deployed.TheForge;
    console.log("Connecting to TheForge at", forgeAddress);
    
    // Attempt to get ABI dynamically from artifact
    const TheForge = await hre.ethers.getContractFactory("TheForge");
    const forge = await TheForge.attach(forgeAddress);

    const signers = await hre.ethers.getSigners();
    const owner = signers[0];
    const node2Signer = signers[1];
    
    console.log("Registering Node 1 with Signer 0...");
    let tx1 = await forge.connect(owner).registerNode("127.0.0.1:8001");
    await tx1.wait();
    console.log("Node 1 registered! TX Hash:", tx1.hash);

    console.log("Registering Node 2 with Signer 1...");
    let tx2 = await forge.connect(node2Signer).registerNode("127.0.0.1:8002");
    await tx2.wait();
    console.log("Node 2 registered! TX Hash:", tx2.hash);
    
    const activeNodes = await forge.getActiveNodes();
    console.log("Active Nodes on TheForge:", activeNodes);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
