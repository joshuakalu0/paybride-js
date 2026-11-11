import { describe, expect, it } from "vitest";

import {
  PayBridge,
  PayBridgeError,
  createPrismaStorage,
  gatewayNames,
  paymentCurrencies,
  transactionStatuses,
  webhookEventTypes
} from "../src";

describe("package exports", () => {
  it("exposes the main service and helper surfaces", () => {
    expect(PayBridge).toBeTypeOf("function");
    expect(PayBridgeError).toBeTypeOf("function");
    expect(createPrismaStorage).toBeTypeOf("function");
    expect(gatewayNames).toContain("stripe");
    expect(paymentCurrencies).toContain("NGN");
    expect(transactionStatuses).toContain("SUCCESS");
    expect(webhookEventTypes).toContain("PAYMENT_SUCCESS");
  });
});
