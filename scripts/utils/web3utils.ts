import { BigNumberish } from "ethers";
import { ethers } from "hardhat";

// allow for decimals to be passed in up to 9dp of precision
export function toBN(val: string|number, decimals?: number) {
  if (typeof val === 'number') {
    // Convert the number to a string
    val = String(val);
  } else if (typeof val !== 'string') {
    throw new Error(`Invalid value type: expected string or number, got ${typeof val}`);
  }
  decimals = decimals || 18;
  // multiplier is to handle decimals
  if (val.includes('e')) {
    if (parseFloat(val) > 1) {
      const x = val.split('.');
      const y = x[1].split('e+');
      const exponent = parseFloat(y[1]);
      const newVal = x[0] + y[0] + '0'.repeat(exponent - y[0].length);
      console.warn(`Warning: toBN of val with exponent, converting to string. (${val}) converted to (${newVal})`);
      val = newVal;
    } else {
      console.warn(
        `Warning: toBN of val with exponent, converting to float. (${val}) converted to (${parseFloat(val).toFixed(
          decimals,
        )})`,
      );
      val = parseFloat(val).toFixed(decimals);
    }
  } else if (val.includes('.') && val.split('.')[1].length > decimals) {
    console.warn(`Warning: toBN of val with more than ${decimals} decimals. Stripping excess. (${val})`);
    const x = val.split('.');
    x[1] = x[1].slice(0, decimals);
    val = x[0] + '.' + x[1];
  }
  return ethers.parseUnits(val, decimals);
}

export function fromBN(val: BigNumberish, dec?: number): string {
  return ethers.formatUnits(val, dec || 18);
}


export function toBytes32(msg: string): string {
  return ethers.encodeBytes32String(msg);
}
