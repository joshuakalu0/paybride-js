import type { IncomingHttpHeaders } from "node:http";

import type {
  BillingInterval,
  GatewayName,
  PaymentCurrency,
  SubscriptionStatus,
  TransactionStatus,
  WebhookEventType
} from "./constants";

export type MetadataValue = boolean | null | number | string;

export type MetadataMap = Record<string, MetadataValue>;

export interface GatewayOptions {
  baseUrl?: string | undefined;
  defaultCurrency?: PaymentCurrency | undefined;
  timeoutMs?: number | undefined;
  userAgent?: string | undefined;
}

export interface CustomerOptions {
  description?: string | undefined;
  email: string;
  metadata?: MetadataMap | undefined;
  name?: string | undefined;
  phone?: string | undefined;
}

export interface InitializeOptions {
  amount: number;
  callbackUrl?: string | undefined;
  channels?: string[] | undefined;
  currency?: PaymentCurrency | undefined;
  customer?: Omit<CustomerOptions, "email"> | undefined;
  description?: string | undefined;
  email: string;
  merchantReference?: string | undefined;
  metadata?: MetadataMap | undefined;
  paymentMethodTypes?: string[] | undefined;
  redirectUrl?: string | undefined;
  setupFutureUsage?: "off_session" | "on_session" | undefined;
}

export interface SubscriptionOptions {
  amount?: number | undefined;
  callbackUrl?: string | undefined;
  currency?: PaymentCurrency | undefined;
  customer?: CustomerOptions | undefined;
  customerId?: string | undefined;
  description?: string | undefined;
  email?: string | undefined;
  interval?: BillingInterval | undefined;
  merchantReference?: string | undefined;
  metadata?: MetadataMap | undefined;
  paymentMethodId?: string | undefined;
  planCode?: string | undefined;
  planId?: number | string | undefined;
  planName?: string | undefined;
  priceId?: string | undefined;
  redirectUrl?: string | undefined;
  trialPeriodDays?: number | undefined;
}

export interface InitializeResult {
  accessCode?: string | undefined;
  amount: number;
  clientSecret?: string | undefined;
  currency: PaymentCurrency;
  gateway: GatewayName;
  merchantReference: string;
  paymentUrl?: string | undefined;
  raw: unknown;
  reference: string;
  status: "PENDING";
}

export interface TransactionResult {
  amount?: number | undefined;
  currency?: PaymentCurrency | undefined;
  customerId?: string | undefined;
  gateway: GatewayName;
  merchantReference?: string | undefined;
  paidAt?: string | undefined;
  raw: unknown;
  reference: string;
  status: TransactionStatus;
}

export interface CustomerResult {
  customerId: string;
  email: string;
  gateway: GatewayName;
  name?: string | undefined;
  raw: unknown;
}

export interface SubscriptionResult {
  checkoutUrl?: string | undefined;
  customerId?: string | undefined;
  gateway: GatewayName;
  nextBillingDate?: string | undefined;
  raw: unknown;
  reference?: string | undefined;
  status: SubscriptionStatus;
  subscriptionId?: string | undefined;
}

export interface WebhookEvent {
  amount?: number | undefined;
  currency?: PaymentCurrency | undefined;
  customerId?: string | undefined;
  eventName: string;
  gateway: GatewayName;
  occurredAt?: string | undefined;
  payload: unknown;
  reference?: string | undefined;
  status?: TransactionStatus | undefined;
  subscriptionId?: string | undefined;
  type: WebhookEventType;
}

export interface ExpressLikeRequest {
  body?: unknown;
  headers: IncomingHttpHeaders;
  method?: string | undefined;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  rawBody?: Buffer | string | undefined;
  readable?: boolean | undefined;
  readableEnded?: boolean | undefined;
}

export interface ExpressLikeResponse {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  statusCode: number;
}

export type NextFunction = (error?: unknown) => void;

export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

export type WebhookMiddleware = (
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next?: NextFunction
) => Promise<void>;

export interface StoredTransactionRecord {
  amount: number | null;
  createdAt?: Date | string | undefined;
  currency: PaymentCurrency | null;
  customerId: string | null;
  gateway: GatewayName;
  id?: string | undefined;
  metadata: Record<string, unknown> | null;
  reference: string;
  status: TransactionStatus | null;
  updatedAt?: Date | string | undefined;
  webhookPayload: unknown | null;
}

export interface TransactionListFilters {
  currency?: PaymentCurrency | undefined;
  customerId?: string | undefined;
  from?: Date | undefined;
  gateway?: GatewayName | undefined;
  reference?: string | undefined;
  status?: TransactionStatus | undefined;
  to?: Date | undefined;
}

export interface TransactionStats {
  byStatus: Record<string, number>;
  totalAmount: number;
  totalCount: number;
}

export interface PayBridgeStorage {
  getTransaction(reference: string): Promise<StoredTransactionRecord | null>;
  getTransactionStats(dateRange?: { from?: Date; to?: Date }): Promise<TransactionStats>;
  listTransactions(filters?: TransactionListFilters): Promise<StoredTransactionRecord[]>;
  recordInitialization(result: InitializeResult, options: InitializeOptions): Promise<void>;
  recordVerification(result: TransactionResult): Promise<void>;
  recordWebhook(event: WebhookEvent): Promise<void>;
}

export interface BaseGatewayConfig extends GatewayOptions {
  storage?: PayBridgeStorage | undefined;
}

export interface PaystackConfig extends BaseGatewayConfig {
  gateway: "paystack";
  secretKey: string;
  webhookSecret?: string | undefined;
}

export interface FlutterwaveConfig extends BaseGatewayConfig {
  gateway: "flutterwave";
  publicKey: string;
  secretKey: string;
  webhookSecret?: string | undefined;
}

export interface StripeConfig extends BaseGatewayConfig {
  gateway: "stripe";
  secretKey: string;
  webhookSecret: string;
}

export type PayBridgeConfig = FlutterwaveConfig | PaystackConfig | StripeConfig;
