import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function createReference(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function hmacBase64(algorithm: string, secret: string, payload: string): string {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("base64");
}

export function hmacHex(algorithm: string, secret: string, payload: string): string {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("hex");
}

export function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
