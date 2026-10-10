require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

let vars;
try {
  vars = require("hardhat/config").vars;
} catch (e) {
  vars = null;
}

function getSecret(name, fallback = "") {
  if (process.env[name]) return process.env[name];
  if (vars && typeof vars.get === "function") {
    try {
      return vars.get(name, fallback);
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
}

// Never commit keys. Configure via .env or Hardhat secret store:
//   npx hardhat vars set SEPOLIA_PRIVATE_KEY
const SEPOLIA_PRIVATE_KEY = getSecret("SEPOLIA_PRIVATE_KEY", "");
const SEPOLIA_RPC_URL = getSecret("SEPOLIA_RPC_URL", "https://ethereum-sepolia.publicnode.com");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      // Local tasks (compile, test, simulate) work without a key
      accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : []
    }
  }
};
