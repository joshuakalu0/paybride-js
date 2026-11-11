import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PayBridge } from "../src";
import { hmacBase64 } from "../src/utils/crypto";

describe("Flutterwave adapter", () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it("initializes and verifies a payment with normalized responses", async () => {
    const paybridge = new PayBridge({
      gateway: "flutterwave",
      publicKey: "FLWPUBK_TEST",
      secretKey: "FLWSECK_TEST",
      webhookSecret: "flw_secret_hash"
    });

    nock("https://api.flutterwave.com")
      .post("/v3/payments")
      .reply(200, {
        data: {
          link: "https://checkout.flutterwave.com/pay/123"
        },
        message: "Hosted link created",
        status: "success"
      });

    const initialized = await paybridge.initializeTransaction({
      amount: 15_000,
      currency: "NGN",
      email: "buyer@example.com",
      merchantReference: "flw_ref_123"
    });

    expect(initialized.reference).toBe("flw_ref_123");
    expect(initialized.paymentUrl).toContain("flutterwave");

    nock("https://api.flutterwave.com")
      .get("/v3/transactions/verify_by_reference")
      .query({
        tx_ref: "flw_ref_123"
      })
      .reply(200, {
        data: {
          amount: 150,
          created_at: "2026-05-07T12:00:00.000Z",
          currency: "NGN",
          customer: {
            id: 19
          },
          status: "successful",
          tx_ref: "flw_ref_123"
        },
        message: "Verified",
        status: "success"
      });

    const verified = await paybridge.verifyTransaction("flw_ref_123");

    expect(verified.amount).toBe(15_000);
    expect(verified.status).toBe("SUCCESS");
  });

  it("validates and normalizes webhook payloads", async () => {
    const paybridge = new PayBridge({
      gateway: "flutterwave",
      publicKey: "FLWPUBK_TEST",
      secretKey: "FLWSECK_TEST",
      webhookSecret: "flw_secret_hash"
    });

    const payload = JSON.stringify({
      data: {
        amount: 150,
        currency: "NGN",
        status: "successful",
        tx_ref: "flw_ref_123"
      },
      event: "charge.completed"
    });
    const signature = hmacBase64("sha256", "flw_secret_hash", payload);

    const event = await paybridge.handleWebhook(payload, signature);

    expect(event.type).toBe("PAYMENT_SUCCESS");
    expect(event.amount).toBe(15_000);
  });
});
