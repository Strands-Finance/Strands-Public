import { ethers } from "hardhat";
import { fromBN } from "./web3utils";

export async function printBalancesForContract(erc20Contract: any) {
  const signers = await ethers.getSigners();

  for (const signer of signers) {
    const address = await signer.getAddress();
    const balance = await erc20Contract.balanceOf(address);
    if (balance > 0) {
      console.log(`Balance for address ${address}: ${balance}`);
    }
  }
}

export async function printRepositoryStatus(repositorySystem: any) {
  const totalSupply = await repositorySystem.repositoryToken.totalSupply();
  let AUM;
  let lastKnownTime = "now";
  try {
    AUM = await repositorySystem.repository.getAUM();
  } catch (error) {
    // console.error("An error occurred:", error.message);
    [AUM, lastKnownTime] = await repositorySystem.repository.getLastKnownAUM();
  }
  let nav;
  try {
    nav = await repositorySystem.repository.getNAV();
  } catch (error) {
    // console.error("An error occurred:", error.message);
    [nav] = await repositorySystem.repository.getLastKnownNAV();
  }
  if (lastKnownTime != "now") {
    const date = new Date(Number(lastKnownTime));
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    lastKnownTime = formatter.format(date);
  }

  console.log(
    "Repository status AUM=%s(%s) totalSupply=%s(%s) nav=%s(%s) asOf=%s",
    fromBN(AUM, 18),
    AUM,
    fromBN(totalSupply, 18),
    totalSupply,
    fromBN(nav, 18),
    nav,
    lastKnownTime
  );
}
