import hre from "hardhat";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function zipToDeployments(
  key: string,
  address: string,
  abiPath: string,
  typeChainPath: string
): Promise<void> {
  const { ethers } = await hre.network.connect();
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
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      if (error !== null) {
        console.error(`Error copying ABI file: ${error}`);
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
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      if (error !== null) {
        console.error(`Error copying TypeChain file: ${error}`);
      }
    }
  );
}
