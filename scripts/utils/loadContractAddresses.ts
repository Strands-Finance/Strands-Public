import fs from "fs";

export const loadContractAddresses = (folderName: string, chainId: string) => {
  let repositoryFactoryData,
    accountNFTData,
    bookKeeperData,
    gateKeeperData,
    repositoryData;

  try {
    const repositoryFactoryPath =
      "./deployments/RepositoryFactory/RepositoryFactory-deployments.json";
    repositoryFactoryData = JSON.parse(
      fs.readFileSync(repositoryFactoryPath, "utf-8")
    );
  } catch {
    repositoryFactoryData = null;
  }

  try {
    // Load account nft info
    const accountNFTFactoryPath =
      "./deployments/StrandsAccount/StrandsAccount-deployments.json";
    accountNFTData = JSON.parse(
      fs.readFileSync(accountNFTFactoryPath, "utf-8")
    );
  } catch {
    accountNFTData = null;
  }

  const rootPath = `./deployments/${folderName}`;

  try {
    const bookKeeperPath = `${rootPath}/BookKeeper/BookKeeper-deployments.json`;
    bookKeeperData = JSON.parse(fs.readFileSync(bookKeeperPath, "utf-8"));
  } catch {
    bookKeeperData = null;
  }

  try {
    const gateKeeperPath = `${rootPath}/GateKeeper/GateKeeper-deployments.json`;
    gateKeeperData = JSON.parse(fs.readFileSync(gateKeeperPath, "utf-8"));
  } catch {
    gateKeeperData = null;
  }

  try {
    const repositoryPath = `${rootPath}/Repository-deployments.json`;
    repositoryData = JSON.parse(fs.readFileSync(repositoryPath, "utf-8"));
  } catch {
    repositoryData;
  }

  return {
    repositoryFactoryAddress: repositoryFactoryData
      ? repositoryFactoryData[chainId]
      : "",
    bookKeeperAddress: bookKeeperData ? bookKeeperData[chainId] : "",
    gateKeeperAddress: gateKeeperData ? gateKeeperData[chainId] : "",
    repositoryAddress: repositoryData ? repositoryData[chainId] : "",
    accountNFTAddress: accountNFTData ? accountNFTData[chainId] : "",
  };
};
