import { PayBridgeError } from "../errors";
import { normalizeGatewayCurrency } from "../utils/currency";
import { requestJson } from "../utils/http";
import { hmacHex, secureCompare } from "../utils/crypto";
import type {
  CustomerOptions,
  CustomerResult,
  InitializeOptions,
  InitializeResult,
  StripeConfig,
  SubscriptionOptions,
  SubscriptionResult,
  SubscriptionStatus,
  TransactionResult,
  TransactionStatus,
  WebhookEvent,
  WebhookEventType
} from "../types";
import { BaseGatewayAdapter } from "./base";
import type { PaymentGateway } from "./interface";

interface StripeCustomerResponse {
  email: string | null;
  id: string;
  name: string | null;
}

interface StripePaymentIntentResponse {
  amount: number;
  client_secret: string | null;
  created: number;
  currency: string;
  customer: null | string;
  id: string;
  metadata: Record<string, string>;
  status: string;
}

interface StripeSubscriptionResponse {
  current_period_end?: number;
  customer: string;
  id: string;
  status: string;
}

export class StripeAdapter extends BaseGatewayAdapter<StripeConfig> implements PaymentGateway {
  constructor(config: StripeConfig) {
    super("stripe", {
      ...config,
      baseUrl: config.baseUrl ?? "https://api.stripe.com/v1",
      timeoutMs: config.timeoutMs ?? 10_000
    });
  }

  async initializeTransaction(options: InitializeOptions): Promise<InitializeResult> {
    this.assertAmount(options.amount);
    const currency = this.normalizeCurrency(options.currency);
    const merchantReference = options.merchantReference ?? this.newReference("stripe");
    const paymentMethodForm =
      options.paymentMethodTypes?.length && options.paymentMethodTypes.length > 0
        ? {
            payment_method_types: options.paymentMethodTypes
          }
        : {
            automatic_payment_methods: {
              enabled: true
            }
          };
    const response = await requestJson<StripePaymentIntentResponse>({
      form: {
        amount: options.amount,
        currency: currency.toLowerCase(),
        description: options.description,
        "metadata[merchant_reference]": merchantReference,
        ...paymentMethodForm,
        receipt_email: options.email,
        setup_future_usage: options.setupFutureUsage
      },
      gateway: this.gateway,
      headers: this.headers,
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/payment_intents`
    });

    return {
      amount: response.amount,
      clientSecret: response.client_secret ?? undefined,
      currency: normalizeGatewayCurrency(response.currency) ?? currency,
      gateway: this.gateway,
      merchantReference,
      raw: response,
      reference: response.id,
      status: "PENDING"
    };
  }

  async verifyTransaction(reference: string): Promise<TransactionResult> {
    const response = await requestJson<StripePaymentIntentResponse>({
      gateway: this.gateway,
      headers: this.headers,
      method: "GET",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/payment_intents/${reference}`
    });

    return {
      amount: response.amount,
      currency: normalizeGatewayCurrency(response.currency),
      customerId: response.customer ?? undefined,
      gateway: this.gateway,
      merchantReference: response.metadata.merchant_reference,
      paidAt: new Date(response.created * 1000).toISOString(),
      raw: response,
      reference: response.id,
      status: mapStripeTransactionStatus(response.status)
    };
  }

  async createCustomer(options: CustomerOptions): Promise<CustomerResult> {
    const response = await requestJson<StripeCustomerResponse>({
      form: {
        description: options.description,
        email: options.email,
        metadata: this.normalizeMetadata(options.metadata),
        name: options.name,
        phone: options.phone
      },
      gateway: this.gateway,
      headers: this.headers,
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/customers`
    });

    return {
      customerId: response.id,
      email: response.email ?? options.email,
      gateway: this.gateway,
      name: response.name ?? options.name,
      raw: response
    };
  }

  async createSubscription(options: SubscriptionOptions): Promise<SubscriptionResult> {
    if (!options.priceId) {
      throw new PayBridgeError({
        code: "INVALID_REQUEST",
        gateway: this.gateway,
        message: "Stripe subscriptions require a priceId."
      });
    }

    const customerId = options.customerId ?? (await this.ensureCustomer(options));

    if (options.paymentMethodId) {
      await requestJson({
        form: {
          customer: customerId
        },
        gateway: this.gateway,
        headers: this.headers,
        method: "POST",
        timeoutMs: this.config.timeoutMs,
        url: `${this.config.baseUrl}/payment_methods/${options.paymentMethodId}/attach`
      });

      await requestJson({
        form: {
          invoice_settings: {
            default_payment_method: options.paymentMethodId
          }
        },
        gateway: this.gateway,
        headers: this.headers,
        method: "POST",
        timeoutMs: this.config.timeoutMs,
        url: `${this.config.baseUrl}/customers/${customerId}`
      });
    }

    const response = await requestJson<StripeSubscriptionResponse>({
      form: {
        customer: customerId,
        "items[0][price]": options.priceId,
        metadata: this.normalizeMetadata(options.metadata),
        trial_period_days: options.trialPeriodDays
      },
      gateway: this.gateway,
      headers: this.headers,
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/subscriptions`
    });

    return {
      customerId,
      gateway: this.gateway,
      nextBillingDate: response.current_period_end ? new Date(response.current_period_end * 1000).toISOString() : undefined,
      raw: response,
      status: mapStripeSubscriptionStatus(response.status),
      subscriptionId: response.id
    };
  }

  async handleWebhook(payload: string | unknown, signature: string): Promise<WebhookEvent> {
    const rawPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
    const parsed = typeof payload === "string" ? (JSON.parse(payload) as Record<string, unknown>) : (payload as Record<string, unknown>);
    const signatureParts = parseStripeSignature(signature);
    const signedPayload = `${signatureParts.timestamp}.${rawPayload}`;
    const expectedSignature = hmacHex("sha256", this.config.webhookSecret, signedPayload);

    if (!signatureParts.signatures.some((candidate) => secureCompare(candidate, expectedSignature))) {
      throw new PayBridgeError({
        code: "INVALID_SIGNATURE",
        gateway: this.gateway,
        message: "The Stripe webhook signature is invalid."
      });
    }

    const eventName = typeof parsed.type === "string" ? parsed.type : "unknown";
    const dataObject = getStripeEventObject(parsed);
    const amount = typeof dataObject.amount === "number" ? dataObject.amount : undefined;
    const currency = typeof dataObject.currency === "string" ? dataObject.currency.toUpperCase() : undefined;
    const status = typeof dataObject.status === "string" ? mapStripeTransactionStatus(dataObject.status) : undefined;

    return {
      amount,
      currency: normalizeGatewayCurrency(currency),
      customerId: typeof dataObject.customer === "string" ? dataObject.customer : undefined,
      eventName,
      gateway: this.gateway,
      occurredAt: typeof parsed.created === "number" ? new Date(parsed.created * 1000).toISOString() : undefined,
      payload: parsed,
      reference: typeof dataObject.id === "string" ? dataObject.id : undefined,
      status,
      subscriptionId: eventName.startsWith("customer.subscription") && typeof dataObject.id === "string" ? dataObject.id : undefined,
      type: mapStripeWebhookEventType(eventName, status)
    };
  }

  private async ensureCustomer(options: SubscriptionOptions): Promise<string> {
    if (options.customerId) {
      return options.customerId;
    }

    const email = options.customer?.email ?? options.email;

    if (!email) {
      throw new PayBridgeError({
        code: "INVALID_REQUEST",
        gateway: this.gateway,
        message: "Stripe subscriptions require a customerId or customer email."
      });
    }

    const customer = await this.createCustomer(
      options.customer ?? {
        email
      }
    );

    return customer.customerId;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
  }
}

function mapStripeTransactionStatus(status: string): TransactionStatus {
  switch (status) {
    case "succeeded":
      return "SUCCESS";
    case "canceled":
      return "ABANDONED";
    case "requires_capture":
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "PENDING";
    default:
      return "FAILED";
  }
}

function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
    case "past_due":
      return "INCOMPLETE";
    default:
      return "PENDING";
  }
}

function mapStripeWebhookEventType(eventName: string, status?: TransactionStatus): WebhookEventType {
  if (eventName === "customer.subscription.created") {
    return "SUBSCRIPTION_CREATED";
  }

  if (eventName === "customer.subscription.deleted") {
    return "SUBSCRIPTION_CANCELLED";
  }

  if (eventName === "payment_intent.succeeded") {
    return "PAYMENT_SUCCESS";
  }

  if (eventName === "payment_intent.payment_failed" || status === "FAILED") {
    return "PAYMENT_FAILED";
  }

  return "UNKNOWN";
}

function parseStripeSignature(header: string): { signatures: string[]; timestamp: string } {
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new PayBridgeError({
      code: "INVALID_SIGNATURE",
      gateway: "stripe",
      message: "The Stripe signature header is malformed."
    });
  }

  return {
    signatures,
    timestamp
  };
}

function getStripeEventObject(payload: Record<string, unknown>): Record<string, unknown> {
  const data = typeof payload.data === "object" && payload.data ? (payload.data as Record<string, unknown>) : {};
  const object = typeof data.object === "object" && data.object ? (data.object as Record<string, unknown>) : {};

  return object;
}
