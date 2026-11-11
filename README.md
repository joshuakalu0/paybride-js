# @booster/paybridge

Unified Paystack, Flutterwave, and Stripe payment workflows for Node.js applications, with optional Prisma-backed transaction storage.

[![CI](https://img.shields.io/badge/CI-ready-blue)](#development)
[![Coverage](https://img.shields.io/badge/coverage-target%2080%25-brightgreen)](#development)
[![Docs](https://img.shields.io/badge/TypeDoc-configured-black)](#documentation)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

PayBridge exists for the moment every backend team hits the same wall: each gateway has different initialization flows, different verification payloads, different webhook signatures, and different ideas about subscriptions. This package gives you one stable server-side interface and keeps the provider differences behind adapters.

## Why it exists

- One constructor for Paystack, Flutterwave, or Stripe
- Normalized results for payments, customers, subscriptions, and webhooks
- Optional Prisma storage so transaction history is captured automatically
- Express-ready webhook middleware with signature validation built in
- Dual ESM/CJS output for modern apps and older Node deployments

## Install

```bash
npm install @booster/paybridge
```

For Prisma-backed storage, also install:

```bash
npm install @prisma/client
```

## Quick Start

```ts
import { PayBridge } from "@booster/paybridge";

const paybridge = new PayBridge({
  gateway: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!
});

const payment = await paybridge.charge({
  amount: 15000,
  currency: "NGN",
  email: "buyer@example.com"
});
```

## Important defaults

- Amounts are expressed in minor units. `15000` means `NGN 150.00`.
- The package is server-first. You create and verify transactions on the backend.
- Stripe returns a `clientSecret` for frontend confirmation flows.
- Stripe transaction verification expects the returned Payment Intent id as the reference.

## Supported gateways

| Gateway | Initialize payment | Verify payment | Create customer | Create subscription | Webhook helper |
| --- | --- | --- | --- | --- | --- |
| Paystack | Yes | Yes | Yes | Yes | Yes |
| Flutterwave | Yes | Yes | Yes | Yes | Yes |
| Stripe | Yes | Yes | Yes | Yes | Yes |

## Constructor

```ts
new PayBridge(config)
```

The config is a discriminated union keyed by `gateway`.

### Paystack

```ts
const paybridge = new PayBridge({
  gateway: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  defaultCurrency: "NGN"
});
```

### Flutterwave

```ts
const paybridge = new PayBridge({
  gateway: "flutterwave",
  publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY!,
  secretKey: process.env.FLUTTERWAVE_SECRET_KEY!,
  webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET!,
  defaultCurrency: "NGN"
});
```

### Stripe

```ts
const paybridge = new PayBridge({
  gateway: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  defaultCurrency: "USD"
});
```

## Main API

- `initializeTransaction(options)`
- `charge(options)` alias for `initializeTransaction`
- `verifyTransaction(reference)`
- `verify(reference)` alias for `verifyTransaction`
- `createCustomer(options)`
- `createSubscription(options)`
- `handleWebhook(payload, signature)`
- `createWebhookHandler(handler)`
- `onWebhook(handler)` alias for `createWebhookHandler`
- `getCurrencies(gateway?)`

## Examples

### Initialize a payment

```ts
const payment = await paybridge.initializeTransaction({
  amount: 25000,
  currency: "NGN",
  email: "buyer@example.com",
  merchantReference: "order_123",
  metadata: {
    cartId: "cart_9"
  }
});
```

### Verify a payment

```ts
const result = await paybridge.verifyTransaction(payment.reference);

if (result.status === "SUCCESS") {
  console.log("Paid", result.reference);
}
```

### Express webhook handling

Mount the webhook route before any body parser mutates the raw payload.

```ts
import express from "express";
import { PayBridge } from "@booster/paybridge";

const app = express();
const paybridge = new PayBridge({
  gateway: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!
});

app.post(
  "/webhooks/stripe",
  paybridge.createWebhookHandler(async (event) => {
    console.log(event.type, event.reference);
  })
);
```

### Optional Prisma storage

```ts
import { PayBridge, createPrismaStorage } from "@booster/paybridge";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const paybridge = new PayBridge({
  gateway: "paystack",
  secretKey: process.env.PAYSTACK_SECRET_KEY!,
  storage: createPrismaStorage({ prisma })
});
```

When storage is configured, PayBridge automatically:

- creates a `PENDING` transaction record on initialization
- updates the record after verification
- stores normalized webhook metadata and raw webhook payloads

You also get:

```ts
await paybridge.transactions?.getTransaction("txn_123");
await paybridge.transactions?.listTransactions({ gateway: "paystack" });
await paybridge.transactions?.getTransactionStats();
```

## Prisma model

Use the schema snippet in [docs/prisma-schema.prisma](./docs/prisma-schema.prisma). The example app under [examples/express-prisma-demo](./examples/express-prisma-demo) shows the intended integration pattern.

## Currencies

`getCurrencies()` returns the current gateway's supported currencies:

```ts
const currencies = paybridge.getCurrencies();
```

Current built-in currency enum:

- `NGN`
- `USD`
- `GHS`
- `ZAR`

## Error handling

All gateway and validation failures are normalized to `PayBridgeError`.

```ts
import { PayBridgeError } from "@booster/paybridge";

try {
  await paybridge.verifyTransaction("missing_ref");
} catch (error) {
  if (error instanceof PayBridgeError) {
    console.error(error.gateway, error.code, error.message);
  }
}
```

## Documentation

- Architecture notes: [docs/architecture.md](./docs/architecture.md)
- Prisma model snippet: [docs/prisma-schema.prisma](./docs/prisma-schema.prisma)
- TypeDoc output is generated to `docs/api` by `pnpm --filter @booster/paybridge docs:build`

## Development

From the workspace root:

```bash
pnpm install
pnpm paybridge:build
pnpm paybridge:test
pnpm --filter @booster/paybridge test:coverage
pnpm paybridge:docs
```

Package-local scripts:

```bash
pnpm --filter @booster/paybridge lint
pnpm --filter @booster/paybridge typecheck
pnpm --filter @booster/paybridge build
pnpm --filter @booster/paybridge test
pnpm --filter @booster/paybridge test:coverage
pnpm --filter @booster/paybridge docs:build
```

## Release flow

- Pull requests run lint, typecheck, build, tests, coverage, and TypeDoc generation.
- Tags like `paybridge-v0.2.0` or `v0.2.0` trigger publish automation.
- The release workflow checks that the tag matches the package version before publishing.
- GitHub Pages deployment is wired for generated TypeDoc output.

## Environment variables

See [.env.example](./.env.example) for the full list.

- `PAYSTACK_SECRET_KEY`
- `FLUTTERWAVE_PUBLIC_KEY`
- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `DATABASE_URL`
