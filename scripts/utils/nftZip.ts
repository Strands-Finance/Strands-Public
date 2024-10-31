import { ethers, network } from "hardhat";
import fs from "fs";
import { exec } from "child_process";
import path from "path";

export default async function zipToDeployments(
  key: string,
  address: string,
  abiPath: string,
  typeChainPath: string
): Promise<void> {
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const contractFilePath = `./deployments/NFT/${key}/${key}-deployments.json`;

  if (!fs.existsSync(`./deployments/NFT/${key}`)) {
    fs.mkdirSync(`./deployments/NFT/${key}`, { recursive: true });
  }

  let existingData;
  try {
    const readResult = await fs.promises.readFile(contractFilePath, {
      encoding: "utf8",
    });
    existingData = JSON.parse(readResult);
  } catch {
    existingData = {};
  }
  existingData[chainId] = address;

  await fs.promises.writeFile(
    contractFilePath,
    JSON.stringify(existingData, null, 2)
  );

  const jsonKey = `${key}.json`;
  const tsKey = `${key}.ts`;

  exec(
    `cp ${abiPath} ${path.join(
      __dirname,
      "..",
      "..",
      "deployments",
      "NFT",
      key,
      jsonKey
    )}`,
    (error, stdout, stderr) => {
      console.log(stdout);
      console.log(stderr);
      if (error !== null) {
        console.log(`exec error: ${error}`);
      }
    }
  );
  exec(
    `cp ${typeChainPath} ${path.join(
      __dirname,
      "..",
      "..",
      "deployments",
      "NFT",
      key,
      tsKey
    )}`,
    (error, stdout, stderr) => {
      console.log(stdout);
      console.log(stderr);
      if (error !== null) {
        console.log(`exec error: ${error}`);
      }
    }
  );
}
