import { expect } from "chai";

export async function expectRevert(promise: Promise<any>, expectedError?: string) {
  try {
    await promise;
    expect.fail("Expected transaction to revert");
  } catch (error: any) {
    if (expectedError) {
      expect(error.message).to.include(expectedError);
    }
  }
}


export async function expectEmit(contract: any, eventName: string, promise: Promise<any>) {
  const tx = await promise;
  const receipt = await tx.wait();

  const event = receipt.logs?.find((log: any) => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed?.name === eventName;
    } catch {
      return false;
    }
  });

  expect(event, `Expected event ${eventName} to be emitted`).to.exist;
  return tx;
}