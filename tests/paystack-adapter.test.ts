import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PayBridge } from "../src";
import { hmacHex } from "../src/utils/crypto";

describe("Paystack adapter", () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it("initializes and verifies a transaction with normalized results", async () => {
    const paybridge = new PayBridge({
      gateway: "paystack",
      secretKey: "sk_test_paystack"
    });

    nock("https://api.paystack.co")
      .post("/transaction/initialize")
      .reply(200, {
        data: {
          access_code: "ACCESS_123",
          authorization_url: "https://checkout.paystack.com/abc",
          reference: "pst_ref_123"
        },
        message: "Authorization URL created",
        status: true
      });

    const initialized = await paybridge.initializeTransaction({
      amount: 15_000,
      currency: "NGN",
      email: "owner@example.com",
      merchantReference: "pst_ref_123"
    });

    expect(initialized.reference).toBe("pst_ref_123");
    expect(initialized.paymentUrl).toContain("paystack");

    nock("https://api.paystack.co")
      .get("/transaction/verify/pst_ref_123")
      .reply(200, {
        data: {
          amount: 15_000,
          currency: "NGN",
          customer: {
            id: 44
          },
          paid_at: "2026-05-07T12:00:00.000Z",
          reference: "pst_ref_123",
          status: "success"
        },
        message: "Verification successful",
        status: true
      });

    const verified = await paybridge.verifyTransaction("pst_ref_123");

    expect(verified.status).toBe("SUCCESS");
    expect(verified.customerId).toBe("44");
  });

  it("normalizes webhook events after validating the signature", async () => {
    const paybridge = new PayBridge({
      gateway: "paystack",
      secretKey: "sk_test_paystack"
    });

    const payload = JSON.stringify({
      data: {
        amount: 15_000,
        currency: "NGN",
        paid_at: "2026-05-07T12:00:00.000Z",
        reference: "pst_ref_123",
        status: "success"
      },
      event: "charge.success"
    });
    const signature = hmacHex("sha512", "sk_test_paystack", payload);

    const event = await paybridge.handleWebhook(payload, signature);

    expect(event.type).toBe("PAYMENT_SUCCESS");
    expect(event.reference).toBe("pst_ref_123");
  });
});
