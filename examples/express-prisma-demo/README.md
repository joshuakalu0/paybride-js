# Express + Prisma Demo

This example shows the intended server-side integration pattern for `@booster/paybridge`.

## What it demonstrates

- Stripe-backed `PayBridge` instantiation
- Optional Prisma storage via `createPrismaStorage`
- Payment initialization endpoint
- Webhook endpoint mounted before JSON body parsing

## Suggested local flow

1. Add the `PaybridgeTransaction` model from [`docs/prisma-schema.prisma`](../../docs/prisma-schema.prisma) to your Prisma schema.
2. Run your Prisma migration.
3. Provide the keys from [`../../.env.example`](../../.env.example).
4. Start the example server and point Stripe or the Stripe CLI at `/webhooks/stripe`.
