import type { GatewayName } from "./constants";

export type PayBridgeErrorCode =
  | "GATEWAY_ERROR"
  | "INVALID_CONFIG"
  | "INVALID_REQUEST"
  | "INVALID_SIGNATURE"
  | "NETWORK_ERROR"
  | "NOT_FOUND"
  | "PARSE_ERROR"
  | "UNSUPPORTED_CURRENCY"
  | "UNSUPPORTED_OPERATION";

export interface PayBridgeErrorOptions {
  code: PayBridgeErrorCode;
  gateway?: GatewayName;
  message: string;
  originalError?: unknown;
}

export class PayBridgeError extends Error {
  readonly code: PayBridgeErrorCode;
  readonly gateway?: GatewayName;
  readonly originalError?: unknown;

  constructor(options: PayBridgeErrorOptions) {
    super(options.message);
    this.code = options.code;
    this.gateway = options.gateway;
    this.name = "PayBridgeError";
    this.originalError = options.originalError;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPayBridgeError(error: unknown): error is PayBridgeError {
  return error instanceof PayBridgeError;
}

export function toPayBridgeError(
  error: unknown,
  options: Omit<PayBridgeErrorOptions, "originalError">
): PayBridgeError {
  if (isPayBridgeError(error)) {
    return error;
  }

  return new PayBridgeError({
    ...options,
    originalError: error
  });
}
