import { PayBridgeError } from "../errors";

export function assertMinorAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PayBridgeError({
      code: "INVALID_REQUEST",
      message: "Amounts must be positive integers expressed in minor units."
    });
  }
}

export function minorToMajorAmount(amount: number): number {
  return Number((amount / 100).toFixed(2));
}
