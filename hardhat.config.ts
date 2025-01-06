import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
require("@nomicfoundation/hardhat-chai-matchers");


const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    excludeContracts: ["MockERC20"],
  },
  mocha: {
    timeout: 100000,
  },
};

export default config;
