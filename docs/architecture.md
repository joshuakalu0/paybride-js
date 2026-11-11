# PayBridge Architecture

PayBridge has three layers:

1. Gateway adapters normalize Paystack, Flutterwave, and Stripe into one interface.
2. The `PayBridge` service class exposes the stable public API used by applications.
3. The optional storage plugin persists transaction lifecycle events through a user-supplied Prisma client.

## Core design choices

- Amounts are expressed in minor units across the package.
- The public API returns library-owned result types instead of raw gateway SDK payloads.
- Webhook middleware validates signatures before handing a normalized event to user code.
- Storage is opt-in and does not force Prisma on consumers who only need gateway operations.
