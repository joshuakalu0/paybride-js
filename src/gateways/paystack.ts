import { PayBridgeError } from "../errors";
import { normalizeGatewayCurrency } from "../utils/currency";
import { requestJson } from "../utils/http";
import { hmacHex, secureCompare } from "../utils/crypto";
import type {
  CustomerOptions,
  CustomerResult,
  InitializeOptions,
  InitializeResult,
  PaystackConfig,
  SubscriptionOptions,
  SubscriptionResult,
  TransactionResult,
  TransactionStatus,
  WebhookEvent,
  WebhookEventType
} from "../types";
import { BaseGatewayAdapter } from "./base";
import type { PaymentGateway } from "./interface";

interface PaystackResponse<T> {
  data: T;
  message: string;
  status: boolean;
}

export class PaystackAdapter extends BaseGatewayAdapter<PaystackConfig> implements PaymentGateway {
  constructor(config: PaystackConfig) {
    super("paystack", {
      ...config,
      baseUrl: config.baseUrl ?? "https://api.paystack.co",
      timeoutMs: config.timeoutMs ?? 10_000
    });
  }

  async initializeTransaction(options: InitializeOptions): Promise<InitializeResult> {
    this.assertAmount(options.amount);
    const currency = this.normalizeCurrency(options.currency);
    const merchantReference = options.merchantReference ?? this.newReference("paystack");

    const response = await requestJson<PaystackResponse<{ access_code: string; authorization_url: string; reference: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        amount: options.amount,
        callback_url: options.callbackUrl ?? options.redirectUrl,
        channels: options.channels,
        currency,
        email: options.email,
        metadata: options.metadata,
        reference: merchantReference
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/transaction/initialize`
    });

    return {
      accessCode: response.data.access_code,
      amount: options.amount,
      currency,
      gateway: this.gateway,
      merchantReference,
      paymentUrl: response.data.authorization_url,
      raw: response,
      reference: response.data.reference,
      status: "PENDING"
    };
  }

  async verifyTransaction(reference: string): Promise<TransactionResult> {
    const response = await requestJson<PaystackResponse<{ amount: number; currency: string; customer?: { id?: number }; paid_at?: string; reference: string; status: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      method: "GET",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/transaction/verify/${reference}`
    });

    return {
      amount: response.data.amount,
      currency: normalizeGatewayCurrency(response.data.currency),
      customerId: response.data.customer?.id ? String(response.data.customer.id) : undefined,
      gateway: this.gateway,
      paidAt: response.data.paid_at,
      raw: response,
      reference: response.data.reference,
      status: mapPaystackTransactionStatus(response.data.status)
    };
  }

  async createCustomer(options: CustomerOptions): Promise<CustomerResult> {
    const [firstName, ...rest] = (options.name ?? "").trim().split(/\s+/);
    const response = await requestJson<PaystackResponse<{ customer_code: string; email: string; first_name?: string; last_name?: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        email: options.email,
        first_name: firstName || undefined,
        last_name: rest.join(" ") || undefined,
        metadata: options.metadata,
        phone: options.phone
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/customer`
    });

    return {
      customerId: response.data.customer_code,
      email: response.data.email,
      gateway: this.gateway,
      name: [response.data.first_name, response.data.last_name].filter(Boolean).join(" ") || undefined,
      raw: response
    };
  }

  async createSubscription(options: SubscriptionOptions): Promise<SubscriptionResult> {
    const customerEmail = this.requireCustomerEmail(options);
    const planCode = options.planCode ?? (await this.createPlan(options));
    const currency = this.normalizeCurrency(options.currency);
    const amount = options.amount ?? 0;
    const merchantReference = options.merchantReference ?? this.newReference("paystack_sub");

    const response = await requestJson<PaystackResponse<{ authorization_url: string; reference: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        callback_url: options.callbackUrl ?? options.redirectUrl,
        currency,
        email: customerEmail,
        metadata: options.metadata,
        plan: planCode,
        reference: merchantReference
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/transaction/initialize`
    });

    return {
      checkoutUrl: response.data.authorization_url,
      gateway: this.gateway,
      raw: response,
      reference: response.data.reference,
      status: "PENDING",
      subscriptionId: planCode
    };
  }

  async handleWebhook(payload: string | unknown, signature: string): Promise<WebhookEvent> {
    const rawPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
    const expectedSignature = hmacHex("sha512", this.config.webhookSecret ?? this.config.secretKey, rawPayload);

    if (!secureCompare(expectedSignature, signature)) {
      throw new PayBridgeError({
        code: "INVALID_SIGNATURE",
        gateway: this.gateway,
        message: "The Paystack webhook signature is invalid."
      });
    }

    const parsed = typeof payload === "string" ? (JSON.parse(payload) as Record<string, unknown>) : (payload as Record<string, unknown>);
    const eventName = typeof parsed.event === "string" ? parsed.event : "unknown";
    const data = typeof parsed.data === "object" && parsed.data ? (parsed.data as Record<string, unknown>) : {};
    const status = typeof data.status === "string" ? mapPaystackTransactionStatus(data.status) : undefined;

    return {
      amount: typeof data.amount === "number" ? data.amount : undefined,
      currency: typeof data.currency === "string" ? normalizeGatewayCurrency(data.currency) : undefined,
      customerId: typeof data.customer === "object" && data.customer && "customer_code" in data.customer ? String((data.customer as { customer_code?: string }).customer_code ?? "") || undefined : undefined,
      eventName,
      gateway: this.gateway,
      occurredAt: typeof data.paid_at === "string" ? data.paid_at : undefined,
      payload: parsed,
      reference: typeof data.reference === "string" ? data.reference : undefined,
      status,
      subscriptionId: typeof data.subscription_code === "string" ? data.subscription_code : undefined,
      type: mapPaystackWebhookEventType(eventName, status)
    };
  }

  private async createPlan(options: SubscriptionOptions): Promise<string> {
    if (!options.amount || !options.interval || !options.planName) {
      throw new PayBridgeError({
        code: "INVALID_REQUEST",
        gateway: this.gateway,
        message: "Paystack subscriptions require a planCode or the trio of amount, interval, and planName."
      });
    }

    this.assertAmount(options.amount);
    const currency = this.normalizeCurrency(options.currency);

    const response = await requestJson<PaystackResponse<{ plan_code: string }>>({
      gateway: this.gateway,
      headers: this.headers,
      json: {
        amount: options.amount,
        currency,
        interval: options.interval,
        name: options.planName
      },
      method: "POST",
      timeoutMs: this.config.timeoutMs,
      url: `${this.config.baseUrl}/plan`
    });

    return response.data.plan_code;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.secretKey}`,
      "Content-Type": "application/json"
    };
  }
}

function mapPaystackTransactionStatus(status: string): TransactionStatus {
  switch (status) {
    case "success":
      return "SUCCESS";
    case "failed":
      return "FAILED";
    case "abandoned":
      return "ABANDONED";
    default:
      return "PENDING";
  }
}

function mapPaystackWebhookEventType(eventName: string, status?: TransactionStatus): WebhookEventType {
  if (eventName.includes("subscription.create")) {
    return "SUBSCRIPTION_CREATED";
  }

  if (eventName.includes("subscription.disable") || eventName.includes("subscription.not_renew")) {
    return "SUBSCRIPTION_CANCELLED";
  }

  if (status === "SUCCESS" || eventName === "charge.success") {
    return "PAYMENT_SUCCESS";
  }

  if (status === "FAILED") {
    return "PAYMENT_FAILED";
  }

  return "UNKNOWN";
}
