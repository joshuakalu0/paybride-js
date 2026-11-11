import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { PayBridge } from "../src";
import { hmacHex } from "../src/utils/crypto";

describe("createWebhookHandler", () => {
  it("reads the raw body, validates the signature, and acknowledges the request", async () => {
    const paybridge = new PayBridge({
      gateway: "paystack",
      secretKey: "sk_test_paystack"
    });

    const payload = JSON.stringify({
      data: {
        amount: 10_000,
        currency: "NGN",
        reference: "pst_ref_123",
        status: "success"
      },
      event: "charge.success"
    });
    const signature = hmacHex("sha512", "sk_test_paystack", payload);
    const req = new PassThrough() as PassThrough & {
      headers: Record<string, string>;
    };

    req.headers = {
      "x-paystack-signature": signature
    };

    let handledReference = "";
    let body = "";
    const res = {
      end(value?: string) {
        body = value ?? "";
      },
      setHeader() {
        return undefined;
      },
      statusCode: 0
    };

    const pending = paybridge.createWebhookHandler(async (event) => {
      handledReference = event.reference ?? "";
    })(req, res);

    req.end(payload);
    await pending;

    expect(handledReference).toBe("pst_ref_123");
    expect(res.statusCode).toBe(200);
    expect(body).toContain("received");
  });
});
