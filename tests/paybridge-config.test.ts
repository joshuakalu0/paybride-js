import { describe, expect, it } from "vitest";

import { PayBridge, PayBridgeError } from "../src";

describe("PayBridge configuration", () => {
  it("rejects invalid gateway config early", () => {
    expect(() => {
      return new PayBridge({
        gateway: "stripe",
        secretKey: "sk_test_stripe"
      } as never);
    }).toThrowError(PayBridgeError);
  });

  it("exposes supported currencies for the active gateway", () => {
    const paybridge = new PayBridge({
      gateway: "paystack",
      secretKey: "sk_test_paystack"
    });

    expect(paybridge.getCurrencies()).toEqual(["NGN", "USD", "GHS", "ZAR"]);
  });
});
