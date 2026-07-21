require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = "REDACTED_PRIVATE_KEY";

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
