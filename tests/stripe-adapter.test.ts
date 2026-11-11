import nock from "nock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PayBridge } from "../src";
import { hmacHex } from "../src/utils/crypto";

describe("Stripe adapter", () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it("creates and verifies a payment intent", async () => {
    const paybridge = new PayBridge({
      gateway: "stripe",
      secretKey: "sk_test_stripe",
      webhookSecret: "whsec_test"
    });

    nock("https://api.stripe.com")
      .post("/v1/payment_intents")
      .reply(200, {
        amount: 15_000,
        client_secret: "pi_123_secret_456",
        created: 1_746_624_000,
        currency: "ngn",
        customer: null,
        id: "pi_123",
        metadata: {
          merchant_reference: "merchant_123"
        },
        status: "requires_payment_method"
      });

    const initialized = await paybridge.initializeTransaction({
      amount: 15_000,
      currency: "NGN",
      email: "stripe@example.com",
      merchantReference: "merchant_123"
    });

    expect(initialized.clientSecret).toContain("pi_123");
    expect(initialized.reference).toBe("pi_123");

    nock("https://api.stripe.com")
      .get("/v1/payment_intents/pi_123")
      .reply(200, {
        amount: 15_000,
        client_secret: "pi_123_secret_456",
        created: 1_746_624_000,
        currency: "ngn",
        customer: "cus_123",
        id: "pi_123",
        metadata: {
          merchant_reference: "merchant_123"
        },
        status: "succeeded"
      });

    const verified = await paybridge.verifyTransaction("pi_123");

    expect(verified.status).toBe("SUCCESS");
    expect(verified.merchantReference).toBe("merchant_123");
  });

  it("creates subscriptions and normalizes webhook events", async () => {
    const paybridge = new PayBridge({
      gateway: "stripe",
      secretKey: "sk_test_stripe",
      webhookSecret: "whsec_test"
    });

    nock("https://api.stripe.com")
      .post("/v1/customers")
      .reply(200, {
        email: "billing@example.com",
        id: "cus_123",
        name: "Billing Owner"
      });

    nock("https://api.stripe.com")
      .post("/v1/subscriptions")
      .reply(200, {
        current_period_end: 1_746_710_400,
        customer: "cus_123",
        id: "sub_123",
        status: "active"
      });

    const subscription = await paybridge.createSubscription({
      customer: {
        email: "billing@example.com",
        name: "Billing Owner"
      },
      priceId: "price_123"
    });

    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.subscriptionId).toBe("sub_123");

    const payload = JSON.stringify({
      created: 1_746_624_100,
      data: {
        object: {
          amount: 15_000,
          currency: "ngn",
          customer: "cus_123",
          id: "pi_123",
          status: "succeeded"
        }
      },
      type: "payment_intent.succeeded"
    });
    const signedPayload = `1746624100.${payload}`;
    const signature = `t=1746624100,v1=${hmacHex("sha256", "whsec_test", signedPayload)}`;

    const event = await paybridge.handleWebhook(payload, signature);

    expect(event.type).toBe("PAYMENT_SUCCESS");
    expect(event.reference).toBe("pi_123");
  });
});
