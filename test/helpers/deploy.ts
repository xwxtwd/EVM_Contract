// helpers/deploy.ts
import { Address, Hash } from "viem";
import hre from "hardhat";
import { getContractFactory } from "./contractFactory";

interface DeployParams {
  name: string;
  args: any[];
  deployer: Address;
}

interface DeployResult {
  address: Address;
  abi: any;
}

export async function deployContract({
                                       name,
                                       args,
                                       deployer
                                     }: DeployParams): Promise<DeployResult> {
  const walletClient = await hre.viem.getWalletClient(deployer);
  const publicClient = await hre.viem.getPublicClient();

  const factory = await getContractFactory(name);

  const deployHash = await walletClient.deployContract({
    abi: factory.abi,
    bytecode: factory.bytecode as `0x${string}`,
    args
  }) as Hash;

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash
  });

  if (!receipt.contractAddress) {
    throw new Error("Contract deployment failed");
  }

  return {
    address: receipt.contractAddress,
    abi: factory.abi
  };
}
