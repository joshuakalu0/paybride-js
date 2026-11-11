import { PayBridgeError } from "../errors";
import { minorToMajorAmount } from "../utils/amounts";
import { normalizeGatewayCurrency } from "../utils/currency";
import { hmacBase64, secureCompare } from "../utils/crypto";
import { requestJson } from "../utils/http";
import type {
  CustomerOptions,
  CustomerResult,
  FlutterwaveConfig,
  InitializeOptions,
  InitializeResult,
  SubscriptionOptions,
  SubscriptionResult,
  TransactionResult,
  TransactionStatus,
  WebhookEvent,
  WebhookEventType
} from "../types";
import { BaseGatewayAdapter } from "./base";
import type { PaymentGateway } from "./interface";

interface FlutterwaveResponse<T> {
  data: T;
  message: string;
  status: string;
}

export class FlutterwaveAdapter extends BaseGatewayAdapter<FlutterwaveConfig> implements PaymentGateway {
  constructor(config: FlutterwaveConfig) {
    super("flutterwave", {
      ...config,
      baseUrl: config.baseUrl ?? "https://api.flutterwave.com",
      timeoutMs: config.timeoutMs ?? 10_000
    });
  }

  async initializeTransaction(options: InitializeOptions): Promise<InitializeResult> {
    this.assertAmount(options.amount);
    const currency = this.normalizeCurrency(options.currency);
    const merchantReference = options.merchantReference ?? this.newReference("flutterwave");

    const response = await requestJson<FlutterwaveResponse<{ link: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        amount: minorToMajorAmount(options.amount),
        currency,
        customer: {
          email: options.email,
          name: this.normalizeCustomerName(options.customer) ?? "PayBridge Customer",
          phonenumber: options.customer?.phone
        },
        customizations: {
          description: options.description,
          title: "PayBridge payment"
        },
        meta: options.metadata,
        redirect_url: options.redirectUrl ?? options.callbackUrl,
        tx_ref: merchantReference
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/v3/payments`
    });

    return {
      amount: options.amount,
      currency,
      gateway: this.gateway,
      merchantReference,
      paymentUrl: response.data.link,
      raw: response,
      reference: merchantReference,
      status: "PENDING"
    };
  }

  async verifyTransaction(reference: string): Promise<TransactionResult> {
    const response = await requestJson<FlutterwaveResponse<{ amount: number; created_at?: string; currency: string; customer?: { id?: number }; status: string; tx_ref: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      method: "GET",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
    });

    return {
      amount: Math.round(response.data.amount * 100),
      currency: normalizeGatewayCurrency(response.data.currency),
      customerId: response.data.customer?.id ? String(response.data.customer.id) : undefined,
      gateway: this.gateway,
      paidAt: response.data.created_at,
      raw: response,
      reference: response.data.tx_ref,
      status: mapFlutterwaveTransactionStatus(response.data.status)
    };
  }

  async createCustomer(options: CustomerOptions): Promise<CustomerResult> {
    const response = await requestJson<FlutterwaveResponse<{ email: string; id: number; name?: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        email: options.email,
        name: options.name,
        phone_number: options.phone
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/customers`
    });

    return {
      customerId: String(response.data.id),
      email: response.data.email,
      gateway: this.gateway,
      name: response.data.name,
      raw: response
    };
  }

  async createSubscription(options: SubscriptionOptions): Promise<SubscriptionResult> {
    const planId = options.planId ?? (await this.createPlan(options));
    const currency = this.normalizeCurrency(options.currency);
    const customerEmail = this.requireCustomerEmail(options);
    const merchantReference = options.merchantReference ?? this.newReference("flutterwave_sub");

    const response = await requestJson<FlutterwaveResponse<{ link: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        currency,
        customer: {
          email: customerEmail,
          name: options.customer?.name ?? "PayBridge Customer",
          phonenumber: options.customer?.phone
        },
        payment_plan: planId,
        redirect_url: options.redirectUrl ?? options.callbackUrl,
        tx_ref: merchantReference
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/v3/payments`
    });

    return {
      checkoutUrl: response.data.link,
      gateway: this.gateway,
      raw: response,
      reference: merchantReference,
      status: "PENDING",
      subscriptionId: String(planId)
    };
  }

  async handleWebhook(payload: string | unknown, signature: string): Promise<WebhookEvent> {
    if (!this.config.webhookSecret) {
      throw new PayBridgeError({
        code: "INVALID_CONFIG",
        gateway: this.gateway,
        message: "Flutterwave webhook validation requires a webhookSecret."
      });
    }

    const rawPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
    const expectedSignature = hmacBase64("sha256", this.config.webhookSecret, rawPayload);

    if (!secureCompare(expectedSignature, signature)) {
      throw new PayBridgeError({
        code: "INVALID_SIGNATURE",
        gateway: this.gateway,
        message: "The Flutterwave webhook signature is invalid."
      });
    }

    const parsed = typeof payload === "string" ? (JSON.parse(payload) as Record<string, unknown>) : (payload as Record<string, unknown>);
    const eventName = typeof parsed.event === "string" ? parsed.event : "unknown";
    const data = typeof parsed.data === "object" && parsed.data ? (parsed.data as Record<string, unknown>) : {};
    const status = typeof data.status === "string" ? mapFlutterwaveTransactionStatus(data.status) : undefined;

    return {
      amount: typeof data.amount === "number" ? Math.round(data.amount * 100) : undefined,
      currency: typeof data.currency === "string" ? normalizeGatewayCurrency(data.currency) : undefined,
      customerId: typeof data.customer === "object" && data.customer && "id" in data.customer ? String((data.customer as { id?: number | string }).id ?? "") || undefined : undefined,
      eventName,
      gateway: this.gateway,
      occurredAt: typeof data.created_at === "string" ? data.created_at : undefined,
      payload: parsed,
      reference: typeof data.tx_ref === "string" ? data.tx_ref : undefined,
      status,
      subscriptionId: typeof data.id === "number" ? String(data.id) : undefined,
      type: mapFlutterwaveWebhookEventType(eventName, status)
    };
  }

  private async createPlan(options: SubscriptionOptions): Promise<number | string> {
    if (!options.amount || !options.interval || !options.planName) {
      throw new PayBridgeError({
        code: "INVALID_REQUEST",
        gateway: this.gateway,
        message: "Flutterwave subscriptions require a planId or the trio of amount, interval, and planName."
      });
    }

    this.assertAmount(options.amount);
    const currency = this.normalizeCurrency(options.currency);

    const response = await requestJson<FlutterwaveResponse<{ id: number }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        amount: minorToMajorAmount(options.amount),
        currency,
        interval: options.interval,
        name: options.planName
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/v3/payment-plans`
    });

    return response.data.id;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.secretKey}`,
      "Content-Type": "application/json"
    };
  }
}

function mapFlutterwaveTransactionStatus(status: string): TransactionStatus {
  switch (status.toLowerCase()) {
    case "successful":
    case "completed":
      return "SUCCESS";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "ABANDONED";
    default:
      return "PENDING";
  }
}

function mapFlutterwaveWebhookEventType(eventName: string, status?: TransactionStatus): WebhookEventType {
  if (eventName.includes("subscription") && eventName.includes("cancel")) {
    return "SUBSCRIPTION_CANCELLED";
  }

  if (eventName.includes("subscription")) {
    return "SUBSCRIPTION_CREATED";
  }

  if (status === "SUCCESS") {
    return "PAYMENT_SUCCESS";
  }

  if (status === "FAILED") {
    return "PAYMENT_FAILED";
  }

  return "UNKNOWN";
}
