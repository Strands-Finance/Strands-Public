import { testSystemContracts } from "../deployDemo";
import hre from "hardhat";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { toBN } from "./web3utils";
import { ProdSystemContracts } from "../deployers/BaseDeployer.js";
import { BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE } from "../config/deploymentConfigs.js";

// In Hardhat v3 with ESM, ethers is available through network.connect()
const { ethers } = await hre.network.connect();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function dumpDeploymentsToFile(
  testSystem: testSystemContracts | ProdSystemContracts,
  jsonFileName: string,
  zipFolderName: string
): Promise<void> {
  // original file
  const filePath = `./${jsonFileName}.json`;
  const contractAddresses = await getContractAddresses(testSystem);
  const data = JSON.stringify(contractAddresses, null, 2);
  try {
    await fs.promises.writeFile(filePath, data);
    console.log("Test system dumped to file:", filePath);
  } catch (error) {
    console.error("Failed to dump test system to file:", error);
  }

  // dump to deployments.json file
  for (let key in contractAddresses) {
    // console.log('---------------')
    const parentFoldername = contractAddresses[key].parentFolderName;
    const subFolderName = key.split("_")[0];

    // console.log("key=%s parentFoldername=%s",key,parentFoldername)
    if (parentFoldername) {
      let addressFilePath
      // making folder 'deployments/Ananke
      if (!fs.existsSync(`./${zipFolderName}/${parentFoldername}`)) {
        console.log("no %s %s",parentFoldername,`./${zipFolderName}/${parentFoldername}`)
        fs.mkdirSync(`./${zipFolderName}/${parentFoldername}`, { recursive: true });
      }
      
      if (subFolderName=='Repository' || subFolderName=='RepositoryToken') {
        addressFilePath = `./${zipFolderName}/${parentFoldername}/${subFolderName}-deployments.json`;
      } else {
        addressFilePath = `./${zipFolderName}/${parentFoldername}/${subFolderName}/${subFolderName}-deployments.json`;

       // making folder 'deployments/Ananke/BookKeeper
       if (
        !fs.existsSync(
          `./${zipFolderName}/${parentFoldername}/${subFolderName}`
        )
        ) {
          console.log("create folder %s",`./${zipFolderName}/${parentFoldername}/${subFolderName}`)
          fs.mkdirSync(
            `./${zipFolderName}/${parentFoldername}/${subFolderName}`,
            { recursive: true }
          );
        }
        // else {
        //   console.log("folder %s exists",`./${zipFolderName}/${parentFoldername}/${subFolderName}`)
        // }
      }

      let existingData;
      try {
        const readResult = await fs.promises.readFile(addressFilePath, {
          encoding: "utf8",
        });
        existingData = JSON.parse(readResult);
      } catch {
        existingData = {};
      }
      existingData[testSystem.chainId] = contractAddresses[key].address;
      // console.log("write to %s: existingData=%s",addressFilePath,existingData)
      await fs.promises.writeFile(
        addressFilePath,
        JSON.stringify(existingData, null, 2)
      );

      const jsonKey = `${key.split("_")[0]}.json`;
      const tsKey = `${key.split("_")[0]}.ts`;
      let filePath

      filePath=path.join(
        __dirname,
        "..",
        "..",
        zipFolderName,
        parentFoldername)
      if (subFolderName!='Repository' && subFolderName!='RepositoryToken') {
        filePath=path.join(filePath,subFolderName)
      }
      // console.log('filePath=%s',filePath)
      exec(
        `cp ${contractAddresses[key].abiPath} ${path.join(filePath,jsonKey)}`,
        (error, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          if (error !== null) {
            console.error(`exec error: ${error}`);
          }
        }
      );
      exec(
        `cp ${contractAddresses[key].typeChainPath} ${path.join(filePath,tsKey)}`,
        (error, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          if (error !== null) {
            console.error(`exec error: ${error}`);
          }
        }
      );
    } else { //Factory, ERC20
      const jsonKey = `${key}.json`;
      const tsKey = `${key}.ts`;

      let filePath

      filePath=path.join(
        __dirname,
        "..",
        "..",
        zipFolderName)

      if (subFolderName!='RepositoryFactory') {
        filePath=path.join(filePath,'ERC20')
        if (!fs.existsSync(filePath)) {
          console.log("no filePathERC %s",filePath)
          fs.mkdirSync(filePath, { recursive: true });
        }
      }

      const contractFilePath = path.join(filePath,key,`${key}-deployments.json`);
      // console.log("contractFilePath=%s",contractFilePath)

      if (!fs.existsSync(`${filePath}/${key}`)) {
        console.log("no filePath %s",`${filePath}/${key}`)
        fs.mkdirSync(`${filePath}/${key}`, { recursive: true });
      }

      let existingData;
      try {
        const readResult = await fs.promises.readFile(contractFilePath, {
          encoding: "utf8",
        });
        existingData = JSON.parse(readResult);
        // console.log("existingData=%s",existingData)
      } catch {
        existingData = {};
      }
      existingData[testSystem.chainId] = contractAddresses[key].address;

      await fs.promises.writeFile(
        contractFilePath,
        JSON.stringify(existingData, null, 2)
      );

      
      // console.log('filePath=%s',filePath)
      exec(`cp ${contractAddresses[key].abiPath} ${path.join(filePath,key,jsonKey)}`,
        (error, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          if (error !== null) {
            console.error(`exec error: ${error}`);
          }
        }
      );
      exec(
        `cp ${contractAddresses[key].typeChainPath} ${path.join(filePath,key,tsKey)}`,
        (error, stdout, stderr) => {
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);
          if (error !== null) {
            console.error(`exec error: ${error}`);
          }
        }
      );
    }
  }
}

async function getContractAddresses(
  testSystem: testSystemContracts | ProdSystemContracts
): any {
  const contractAddresses: any = {};
  let i = 0;
  for (const repositoryContract of testSystem.repositoryContracts) {
    const parentFolderName = repositoryContract.folderName;
    // console.log("repositoryContract=%s",repositoryContract)
    contractAddresses[`Repository_${i}`] = {
      address: await repositoryContract.repository.getAddress(),
      arguments: [
        typeof repositoryContract.owner === 'string' ? repositoryContract.owner : await repositoryContract.owner.getAddress(),
        typeof repositoryContract.controller === 'string' ? repositoryContract.controller : await repositoryContract.controller.getAddress()
      ],
      contract: "contracts/Repository.sol:Repository",
      abi: (await ethers.getContractFactory("Repository")).interface,
      abiPath: `${path.join(
        __dirname,
        "../../artifacts/contracts/Repository.sol/Repository.json"
      )}`,
      typeChainPath: `${path.join(
        __dirname,
        "../../typechain-types/Repository.ts"
      )}`,
      parentFolderName,
    };
    if (
      repositoryContract.bookKeeperType ===
      BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER
    ) {
      contractAddresses[`BookKeeper_${i}`] = {
        address: await repositoryContract.bookKeeper.getAddress(),
        arguments: [],
        contract: "contracts/BookKeepers/AccountNFTBookKeeper.sol:AccountNFTBookKeeper",
        abi: (await ethers.getContractFactory("AccountNFTBookKeeper"))
          .interface,
        abiPath: `${path.join(
          __dirname,
          "../../artifacts/contracts/BookKeepers/AccountNFTBookKeeper.sol/AccountNFTBookKeeper.json"
        )}`,
        typeChainPath: `${path.join(
          __dirname,
          "../../typechain-types/BookKeepers/AccountNFTBookKeeper.ts"
        )}`,
        parentFolderName,
      };
    } else if (
      repositoryContract.bookKeeperType ===
      BOOK_KEEPER_TYPE.SIMPLE_BOOK_KEEPER
    ) {
      contractAddresses[`BookKeeper_${i}`] = {
        address: await repositoryContract.bookKeeper.getAddress(),
        arguments: [],
        contract: "contracts/BookKeepers/SimpleBookKeeper.sol:SimpleBookKeeper",
        abi: (await ethers.getContractFactory("SimpleBookKeeper"))
          .interface,
        abiPath: `${path.join(
          __dirname,
          "../../artifacts/contracts/BookKeepers/SimpleBookKeeper.sol/SimpleBookKeeper.json"
        )}`,
        typeChainPath: `${path.join(
          __dirname,
          "../../typechain-types/BookKeepers/SimpleBookKeeper.ts"
        )}`,
        parentFolderName,
      };
    }  else if (
      repositoryContract.bookKeeperType ===
      BOOK_KEEPER_TYPE.DIRECT_INPUT_BOOK_KEEPER
    ){
      contractAddresses[`BookKeeper_${i}`] = {
        address: await repositoryContract.bookKeeper.getAddress(),
        arguments: [],
        contract: "contracts/BookKeepers/DirectInputBookKeeper.sol:DirectInputBookKeeper",
        abi: (await ethers.getContractFactory("DirectInputBookKeeper")).interface,
        abiPath: `${path.join(
          __dirname,
          "../../artifacts/contracts/BookKeepers/DirectInputBookKeeper.sol/DirectInputBookKeeper.json"
        )}`,
        typeChainPath: `${path.join(
          __dirname,
          "../../typechain-types/BookKeepers/DirectInputBookKeeper.ts"
        )}`,
        parentFolderName,
      };
    } else {
      console.log("Unknown BK type")
    }

    contractAddresses[`RepositoryToken_${i}`] = {
      address: await repositoryContract.repositoryToken.getAddress(),
      arguments: [
        await testSystem.repositoryContracts[0].repositoryToken.name(),
        await testSystem.repositoryContracts[0].repositoryToken.symbol(),
        await repositoryContract.gateKeeper.getAddress(),
        await repositoryContract.repository.getAddress(),
      ],
      contract: "contracts/RepositoryToken.sol:RepositoryToken",
      abi: (await ethers.getContractFactory("RepositoryToken")).interface,
      abiPath: `${path.join(
        __dirname,
        "../../artifacts/contracts/RepositoryToken.sol/RepositoryToken.json"
      )}`,
      typeChainPath: `${path.join(
        __dirname,
        "../../typechain-types/RepositoryToken.ts"
      )}`,
      parentFolderName,
    };

    if (
      repositoryContract.gateKeeperType ===
      GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER
    ) {
      contractAddresses[`GateKeeper_${i}`] = {
        address: await repositoryContract.gateKeeper.getAddress(),
        arguments: [],
        contract: "contracts/GateKeepers/WhitelistGateKeeper.sol:WhitelistGateKeeper",
        abi: (await ethers.getContractFactory("WhitelistGateKeeper")).interface,
        abiPath: `${path.join(
          __dirname,
          "../../artifacts/contracts/GateKeepers/WhitelistGateKeeper.sol/WhitelistGateKeeper.json"
        )}`,
        typeChainPath: `${path.join(
          __dirname,
          "../../typechain-types/GateKeepers/WhitelistGateKeeper.ts"
        )}`,
        parentFolderName,
      };
    } else {
      contractAddresses[`GateKeeper_${i}`] = {
        address: await repositoryContract.gateKeeper.getAddress(),
        arguments: [],
        contract: "contracts/GateKeepers/NFTGateKeeper.sol:NFTGateKeeper",
        abi: (await ethers.getContractFactory("NFTGateKeeper")).interface,
        abiPath: `${path.join(
          __dirname,
          "../../artifacts/contracts/GateKeepers/NFTGateKeeper.sol/NFTGateKeeper.json"
        )}`,
        typeChainPath: `${path.join(
          __dirname,
          "../../typechain-types/GateKeepers/NFTGateKeeper.ts"
        )}`,
        parentFolderName,
      };
    }
  }

  contractAddresses["RepositoryFactory"] = {
    address: await testSystem.repositoryFactory.getAddress(),
    arguments: [await testSystem.deployer.getAddress(), await testSystem.deployer.getAddress(), await testSystem.MockWETH.getAddress()],
    contract: "contracts/RepositoryFactory.sol:RepositoryFactory",
    abi: (await ethers.getContractFactory("RepositoryFactory")).interface,
    abiPath: `${path.join(
      __dirname,
      "../../artifacts/contracts/RepositoryFactory.sol/RepositoryFactory.json"
    )}`,
    typeChainPath: `${path.join(
      __dirname,
      "../../typechain-types/RepositoryFactory.ts"
    )}`,
  };

  if (await testSystem.MockUSDC) {
    contractAddresses["USDC"] = {
      address: await testSystem.MockUSDC.getAddress(),
      arguments: ["USDC", "USDC", 6],
      contract: "contracts/test-helpers/TestERC20SetDecimals.sol:TestERC20SetDecimals",
      abi: (await ethers.getContractFactory("TestERC20SetDecimals")).interface,
      abiPath: `${path.join(
        __dirname,
        "../../artifacts/contracts/test-helpers/TestERC20SetDecimals.sol/TestERC20SetDecimals.json"
      )}`,
      typeChainPath: `${path.join(
        __dirname,
        "../../typechain-types/test-helpers/TestERC20SetDecimals.ts"
      )}`,
    };
  }
  
  if (await testSystem.MockWETH) {
    contractAddresses["WETH"] = {
      address: await testSystem.MockWETH.getAddress(),
      arguments: ["WETH", "WETH", 18],
      contract: "contracts/test-helpers/TestERC20SetDecimals.sol:TestERC20SetDecimals",
      abi: (await ethers.getContractFactory("TestERC20SetDecimals")).interface,
      abiPath: `${path.join(
        __dirname,
        "../../artifacts/contracts/test-helpers/TestERC20SetDecimals.sol/TestERC20SetDecimals.json"
      )}`,
      typeChainPath: `${path.join(
        __dirname,
        "../../typechain-types/test-helpers/TestERC20SetDecimals.ts"
      )}`,
    };
  }
  if (await testSystem.strandsAPI) {
    contractAddresses["API"] = {
      address: await testSystem.strandsAPI.getAddress(),
      arguments: [
        typeof testSystem.repositoryContracts[0].owner === 'string' ? testSystem.repositoryContracts[0].owner : await testSystem.repositoryContracts[0].owner.getAddress(),
        typeof testSystem.repositoryContracts[0].controller === 'string' ? testSystem.repositoryContracts[0].controller : await testSystem.repositoryContracts[0].controller.getAddress()
      ],
      contract: "contracts/strands/StrandsAPI.sol:StrandsAPI",
      abi: (await ethers.getContractFactory("StrandsAPI")).interface,
      abiPath: `${path.join(
        __dirname,
        "../../artifacts/contracts/strands/StrandsAPI.sol/StrandsAPI.json"
      )}`,
      typeChainPath: `${path.join(
        __dirname,
        "../../typechain-types/strands/StrandsAPI.ts"
      )}`,
    };
  }

  // console.log("contract addresses", contractAddresses);

  return contractAddresses;
}

export { dumpDeploymentsToFile };
