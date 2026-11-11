export const gatewayNames = ["paystack", "flutterwave", "stripe"] as const;

export type GatewayName = (typeof gatewayNames)[number];

export const paymentCurrencies = ["NGN", "USD", "GHS", "ZAR"] as const;

export type PaymentCurrency = (typeof paymentCurrencies)[number];

export const transactionStatuses = ["PENDING", "SUCCESS", "FAILED", "ABANDONED"] as const;

export type TransactionStatus = (typeof transactionStatuses)[number];

export const subscriptionStatuses = ["PENDING", "ACTIVE", "INCOMPLETE", "TRIALING", "CANCELLED"] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const webhookEventTypes = [
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_CANCELLED",
  "UNKNOWN"
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

export const billingIntervals = ["daily", "weekly", "monthly", "quarterly", "annually"] as const;

export type BillingInterval = (typeof billingIntervals)[number];

export const supportedCurrenciesByGateway: Record<GatewayName, readonly PaymentCurrency[]> = {
  flutterwave: paymentCurrencies,
  paystack: paymentCurrencies,
  stripe: paymentCurrencies
};
