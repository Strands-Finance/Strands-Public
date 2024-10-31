import { verifyContractsFromFile } from "../etherscanVerify";

async function verifyFromFile(filePath: string): Promise<void> {
  await verifyContractsFromFile(filePath);
}

verifyFromFile('./testSystem.json')
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
