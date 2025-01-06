// helpers/contractFactory.ts
import { artifacts } from "hardhat";

export async function getContractFactory(name: string) {
  const artifact = await artifacts.readArtifact(name);
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  };
}