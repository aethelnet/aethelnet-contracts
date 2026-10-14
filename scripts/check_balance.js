const { ethers } = require("hardhat");
async function main() {
    const address = "0x744E734B34782bd54852B1af6d1675A253e67124";
    const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    const balance = await contract.balanceOf(address);
    console.log("Token Balance:", balance.toString());
}
main();
