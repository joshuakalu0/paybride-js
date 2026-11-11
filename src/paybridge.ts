import type { IncomingHttpHeaders } from "node:http";

import { PayBridgeError } from "./errors";
import { FlutterwaveAdapter, PaystackAdapter, StripeAdapter } from "./gateways";
import { getCurrencies } from "./utils/currency";
import { readWebhookBody } from "./utils/webhook";
import type { PaymentGateway } from "./gateways";
import type {
  CustomerOptions,
  CustomerResult,
  GatewayName,
  InitializeOptions,
  InitializeResult,
  PayBridgeConfig,
  PayBridgeStorage,
  SubscriptionOptions,
  SubscriptionResult,
  TransactionListFilters,
  TransactionResult,
  TransactionStats,
  WebhookEvent,
  WebhookHandler,
  WebhookMiddleware
} from "./types";

export class PayBridge {
  readonly gateway: GatewayName;
  readonly transactions?: {
    getTransaction(reference: string): Promise<Awaited<ReturnType<PayBridgeStorage["getTransaction"]>>>;
    getTransactionStats(dateRange?: { from?: Date; to?: Date }): Promise<TransactionStats>;
    listTransactions(filters?: TransactionListFilters): Promise<Awaited<ReturnType<PayBridgeStorage["listTransactions"]>>>;
  };

  private readonly adapter: PaymentGateway;
  private readonly storage?: PayBridgeStorage;

  constructor(private readonly config: PayBridgeConfig) {
    assertValidConfig(config);
    this.gateway = config.gateway;
    this.adapter = createAdapter(config);
    this.storage = config.storage;

    if (this.storage) {
      this.transactions = {
        getTransaction: async (reference) => await this.storage!.getTransaction(reference),
        getTransactionStats: async (dateRange) => await this.storage!.getTransactionStats(dateRange),
        listTransactions: async (filters) => await this.storage!.listTransactions(filters)
      };
    }
  }

  async initializeTransaction(options: InitializeOptions): Promise<InitializeResult> {
    const result = await this.adapter.initializeTransaction(options);

    if (this.storage) {
      await this.storage.recordInitialization(result, options);
    }

    return result;
  }

  async charge(options: InitializeOptions): Promise<InitializeResult> {
    return await this.initializeTransaction(options);
  }

  async verifyTransaction(reference: string): Promise<TransactionResult> {
    const result = await this.adapter.verifyTransaction(reference);

    if (this.storage) {
      await this.storage.recordVerification(result);
    }

    return result;
  }

  async verify(reference: string): Promise<TransactionResult> {
    return await this.verifyTransaction(reference);
  }

  async createCustomer(options: CustomerOptions): Promise<CustomerResult> {
    return await this.adapter.createCustomer(options);
  }

  async createSubscription(options: SubscriptionOptions): Promise<SubscriptionResult> {
    return await this.adapter.createSubscription(options);
  }

  async handleWebhook(payload: string | unknown, signature: string): Promise<WebhookEvent> {
    const event = await this.adapter.handleWebhook(payload, signature);

    if (this.storage) {
      await this.storage.recordWebhook(event);
    }

    return event;
  }

  createWebhookHandler(handler: WebhookHandler): WebhookMiddleware {
    return async (req, res, next) => {
      try {
        const body = await readWebhookBody(req);
        const signature = getSignatureHeader(this.gateway, req.headers);

        if (!signature) {
          throw new PayBridgeError({
            code: "INVALID_SIGNATURE",
            gateway: this.gateway,
            message: `Missing webhook signature header for ${this.gateway}.`
          });
        }

        const event = await this.handleWebhook(body, signature);
        await handler(event);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ received: true }));
      } catch (error) {
        if (next) {
          next(error);
          return;
        }

        res.statusCode = error instanceof PayBridgeError ? 400 : 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Webhook handling failed."
          })
        );
      }
    };
  }

  onWebhook(handler: WebhookHandler): WebhookMiddleware {
    return this.createWebhookHandler(handler);
  }

  getCurrencies(gateway = this.gateway) {
    return getCurrencies(gateway);
  }
}

function createAdapter(config: PayBridgeConfig): PaymentGateway {
  switch (config.gateway) {
    case "paystack":
      return new PaystackAdapter(config);
    case "flutterwave":
      return new FlutterwaveAdapter(config);
    case "stripe":
      return new StripeAdapter(config);
    default:
      throw new PayBridgeError({
        code: "INVALID_CONFIG",
        message: "Unsupported gateway configuration."
      });
  }
}

function assertValidConfig(config: PayBridgeConfig): void {
  switch (config.gateway) {
    case "paystack":
      if (!config.secretKey) {
        throw new PayBridgeError({
          code: "INVALID_CONFIG",
          gateway: config.gateway,
          message: "Paystack requires a secretKey."
        });
      }
      break;
    case "flutterwave":
      if (!config.publicKey || !config.secretKey) {
        throw new PayBridgeError({
          code: "INVALID_CONFIG",
          gateway: config.gateway,
          message: "Flutterwave requires both publicKey and secretKey."
        });
      }
      break;
    case "stripe":
      if (!config.secretKey || !config.webhookSecret) {
        throw new PayBridgeError({
          code: "INVALID_CONFIG",
          gateway: config.gateway,
          message: "Stripe requires a secretKey and webhookSecret."
        });
      }
      break;
  }
}

function getSignatureHeader(gateway: GatewayName, headers: IncomingHttpHeaders): string | undefined {
  switch (gateway) {
    case "paystack":
      return getHeaderValue(headers["x-paystack-signature"]);
    case "flutterwave":
      return getHeaderValue(headers["flutterwave-signature"]);
    case "stripe":
      return getHeaderValue(headers["stripe-signature"]);
  }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
