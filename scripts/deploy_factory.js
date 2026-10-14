const hre = require("hardhat");
async function main() {
    const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
    const Factory = await hre.ethers.getContractFactory("SimpleAccountFactory");
    const factory = await Factory.deploy(ENTRY_POINT);
    await factory.waitForDeployment();
    console.log("Factory:", await factory.getAddress());
}
main().catch(console.error);
