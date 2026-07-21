require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = "d35bcb391904a95ef74a366654964d63ab09675ae7b82036d0f3ff28a0a69b1c";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://ethereum-sepolia.publicnode.com",
      accounts: [PRIVATE_KEY]
    }
  }
};
