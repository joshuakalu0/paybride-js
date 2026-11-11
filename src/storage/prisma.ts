import { PayBridgeError } from "../errors";
import type {
  InitializeOptions,
  InitializeResult,
  PayBridgeStorage,
  StoredTransactionRecord,
  TransactionListFilters,
  TransactionResult,
  TransactionStats,
  WebhookEvent
} from "../types";

interface PrismaTransactionDelegate {
  create(args: { data: Record<string, unknown> }): Promise<StoredTransactionRecord>;
  findMany(args: { orderBy?: Record<string, "asc" | "desc">; where?: Record<string, unknown> }): Promise<StoredTransactionRecord[]>;
  findUnique(args: { where: { reference: string } }): Promise<StoredTransactionRecord | null>;
  upsert(args: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    where: { reference: string };
  }): Promise<StoredTransactionRecord>;
}

export function createPrismaStorage(options: {
  modelName?: string;
  prisma: Record<string, unknown>;
}): PayBridgeStorage {
  const modelName = options.modelName ?? "paybridgeTransaction";
  const delegate = options.prisma[modelName];

  if (!delegate || typeof delegate !== "object") {
    throw new PayBridgeError({
      code: "INVALID_CONFIG",
      message: `Prisma model "${modelName}" was not found on the supplied client.`
    });
  }

  const transactionDelegate = delegate as PrismaTransactionDelegate;

  return {
    async getTransaction(reference) {
      return await transactionDelegate.findUnique({
        where: {
          reference
        }
      });
    },
    async getTransactionStats(dateRange) {
      const createdAt = buildDateRangeWhere(dateRange);
      const transactions = await transactionDelegate.findMany({
        where: createdAt
          ? {
              createdAt
            }
          : undefined
      });

      return summarizeTransactions(transactions);
    },
    async listTransactions(filters) {
      return await transactionDelegate.findMany({
        orderBy: {
          createdAt: "desc"
        },
        where: buildWhere(filters)
      });
    },
    async recordInitialization(result, request) {
      await transactionDelegate.upsert({
        create: {
          amount: result.amount,
          currency: result.currency,
          customerId: null,
          gateway: result.gateway,
          metadata: {
            ...request.metadata,
            email: request.email
          },
          reference: result.reference,
          status: result.status,
          webhookPayload: null
        },
        update: {
          amount: result.amount,
          currency: result.currency,
          customerId: null,
          gateway: result.gateway,
          metadata: {
            ...request.metadata,
            email: request.email
          },
          status: result.status
        },
        where: {
          reference: result.reference
        }
      });
    },
    async recordVerification(result) {
      await transactionDelegate.upsert({
        create: {
          amount: result.amount ?? null,
          currency: result.currency ?? null,
          customerId: result.customerId ?? null,
          gateway: result.gateway,
          metadata: {
            merchantReference: result.merchantReference ?? null,
            paidAt: result.paidAt ?? null
          },
          reference: result.reference,
          status: result.status,
          webhookPayload: null
        },
        update: {
          amount: result.amount ?? null,
          currency: result.currency ?? null,
          customerId: result.customerId ?? null,
          metadata: {
            merchantReference: result.merchantReference ?? null,
            paidAt: result.paidAt ?? null
          },
          status: result.status
        },
        where: {
          reference: result.reference
        }
      });
    },
    async recordWebhook(event) {
      const reference = event.reference ?? `webhook_${event.gateway}_${event.eventName}`;

      await transactionDelegate.upsert({
        create: {
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          customerId: event.customerId ?? null,
          gateway: event.gateway,
          metadata: {
            eventName: event.eventName,
            eventType: event.type,
            occurredAt: event.occurredAt ?? null,
            status: event.status ?? null,
            subscriptionId: event.subscriptionId ?? null
          },
          reference,
          status: event.status ?? null,
          webhookPayload: event.payload
        },
        update: {
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          customerId: event.customerId ?? null,
          metadata: {
            eventName: event.eventName,
            eventType: event.type,
            occurredAt: event.occurredAt ?? null,
            status: event.status ?? null,
            subscriptionId: event.subscriptionId ?? null
          },
          status: event.status ?? null,
          webhookPayload: event.payload
        },
        where: {
          reference
        }
      });
    }
  };
}

function buildWhere(filters?: TransactionListFilters): Record<string, unknown> | undefined {
  if (!filters) {
    return undefined;
  }

  const where: Record<string, unknown> = {};

  if (filters.currency) {
    where.currency = filters.currency;
  }

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.gateway) {
    where.gateway = filters.gateway;
  }

  if (filters.reference) {
    where.reference = filters.reference;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.createdAt = buildDateRangeWhere(filters);
  }

  return Object.keys(where).length > 0 ? where : undefined;
}

function buildDateRangeWhere(dateRange?: { from?: Date; to?: Date }): Record<string, Date> | undefined {
  if (!dateRange?.from && !dateRange?.to) {
    return undefined;
  }

  const where: Record<string, Date> = {};

  if (dateRange.from) {
    where.gte = dateRange.from;
  }

  if (dateRange.to) {
    where.lte = dateRange.to;
  }

  return where;
}

function summarizeTransactions(transactions: StoredTransactionRecord[]): TransactionStats {
  return transactions.reduce<TransactionStats>(
    (stats, transaction) => {
      const key = transaction.status ?? "UNKNOWN";

      stats.byStatus[key] = (stats.byStatus[key] ?? 0) + 1;
      stats.totalAmount += transaction.amount ?? 0;
      stats.totalCount += 1;

      return stats;
    },
    {
      byStatus: {},
      totalAmount: 0,
      totalCount: 0
    }
  );
}
