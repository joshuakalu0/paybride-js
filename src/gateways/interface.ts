import type {
  CustomerOptions,
  CustomerResult,
  InitializeOptions,
  InitializeResult,
  SubscriptionOptions,
  SubscriptionResult,
  TransactionResult,
  WebhookEvent
} from "../types";

export interface PaymentGateway {
  createCustomer(options: CustomerOptions): Promise<CustomerResult>;
  createSubscription(options: SubscriptionOptions): Promise<SubscriptionResult>;
  handleWebhook(payload: string | unknown, signature: string): Promise<WebhookEvent>;
  initializeTransaction(options: InitializeOptions): Promise<InitializeResult>;
  verifyTransaction(reference: string): Promise<TransactionResult>;
}
