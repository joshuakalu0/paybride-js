import express from "express";

import { PayBridge, createPrismaStorage } from "../../../src";

type PrismaLikeClient = Record<string, unknown>;

function getPrismaClient(): PrismaLikeClient {
  throw new Error("Replace this stub with a real PrismaClient import in your app.");
}

const prisma = getPrismaClient();
const app = express();

const paybridge = new PayBridge({
  gateway: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY ?? "sk_test_replace_me",
  storage: createPrismaStorage({
    prisma
  }),
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_replace_me"
});

app.post("/payments/initialize", express.json(), async (req, res) => {
  const payment = await paybridge.initializeTransaction({
    amount: 15_000,
    currency: "NGN",
    email: req.body.email as string,
    merchantReference: `order_${Date.now()}`
  });

  res.json(payment);
});

// Mount the webhook route before any JSON parser touches the raw body.
app.post(
  "/webhooks/stripe",
  paybridge.createWebhookHandler(async (event) => {
    console.log("Received PayBridge event", event.type, event.reference);
  })
);

app.listen(4104, () => {
  console.log("PayBridge demo listening on http://localhost:4104");
});
