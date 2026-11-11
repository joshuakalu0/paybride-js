import { describe, expect, it } from "vitest";

import { createPrismaStorage } from "../src";

describe("Prisma storage plugin", () => {
  it("persists lifecycle events and exposes query helpers", async () => {
    const rows: Array<Record<string, unknown>> = [];

    const prisma = {
      paybridgeTransaction: {
        async create(args: { data: Record<string, unknown> }) {
          rows.push(args.data);
          return args.data;
        },
        async findMany(args: { where?: Record<string, unknown> }) {
          if (!args.where) {
            return rows as never;
          }

          return rows.filter((row) => {
            return Object.entries(args.where ?? {}).every(([key, value]) => {
              if (key === "createdAt" && value && typeof value === "object") {
                return true;
              }

              return row[key] === value;
            });
          }) as never;
        },
        async findUnique(args: { where: { reference: string } }) {
          return (rows.find((row) => row.reference === args.where.reference) ?? null) as never;
        },
        async upsert(args: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
          where: { reference: string };
        }) {
          const existingIndex = rows.findIndex((row) => row.reference === args.where.reference);

          if (existingIndex === -1) {
            rows.push(args.create);
            return args.create as never;
          }

          rows[existingIndex] = {
            ...rows[existingIndex],
            ...args.update
          };

          return rows[existingIndex] as never;
        }
      }
    };

    const storage = createPrismaStorage({ prisma });

    await storage.recordInitialization(
      {
        amount: 15_000,
        currency: "NGN",
        gateway: "paystack",
        merchantReference: "merchant_123",
        raw: {},
        reference: "txn_123",
        status: "PENDING"
      },
      {
        amount: 15_000,
        currency: "NGN",
        email: "owner@example.com"
      }
    );

    await storage.recordVerification({
      amount: 15_000,
      currency: "NGN",
      gateway: "paystack",
      raw: {},
      reference: "txn_123",
      status: "SUCCESS"
    });

    await storage.recordWebhook({
      eventName: "charge.success",
      gateway: "paystack",
      payload: {
        ok: true
      },
      reference: "txn_123",
      status: "SUCCESS",
      type: "PAYMENT_SUCCESS"
    });

    const transaction = await storage.getTransaction("txn_123");
    const stats = await storage.getTransactionStats();
    const list = await storage.listTransactions({
      gateway: "paystack"
    });

    expect(transaction?.status).toBe("SUCCESS");
    expect(stats.totalCount).toBe(1);
    expect(stats.byStatus.SUCCESS).toBe(1);
    expect(list).toHaveLength(1);
  });
});
