import { JsonRpcProvider } from "@ethersproject/providers";

export async function getGasFeeInfo(provider: JsonRpcProvider) {
  const feeData = await provider.getFeeData();

  return {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };
}
