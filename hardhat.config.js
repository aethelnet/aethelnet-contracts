require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

// Never commit keys. Store them once with Hardhat's built-in secret store:
//   npx hardhat vars set SEPOLIA_PRIVATE_KEY
// or export SEPOLIA_PRIVATE_KEY in your shell / CI secrets.
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || vars.get("SEPOLIA_PRIVATE_KEY", "");
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || vars.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia.publicnode.com");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      // Local tasks (compile, test, simulate) work without a key
      accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : []
    }
  }
};
