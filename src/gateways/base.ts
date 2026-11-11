import { getCurrencies, resolveCurrency } from "../utils/currency";
import { createReference } from "../utils/crypto";
import { assertMinorAmount } from "../utils/amounts";
import { PayBridgeError, toPayBridgeError } from "../errors";
import type {
  BaseGatewayConfig,
  CustomerOptions,
  GatewayName,
  InitializeOptions,
  MetadataMap,
  PaymentCurrency,
  SubscriptionOptions
} from "../types";

export abstract class BaseGatewayAdapter<TConfig extends BaseGatewayConfig> {
  protected readonly config: TConfig;
  protected readonly gateway: GatewayName;

  protected constructor(gateway: GatewayName, config: TConfig) {
    this.config = config;
    this.gateway = gateway;
  }

  protected get currencyList(): readonly PaymentCurrency[] {
    return getCurrencies(this.gateway);
  }

  protected assertAmount(amount: number): void {
    assertMinorAmount(amount);
  }

  protected normalizeCurrency(currency?: PaymentCurrency): PaymentCurrency {
    return resolveCurrency(this.gateway, currency, this.config.defaultCurrency);
  }

  protected newReference(prefix = this.gateway): string {
    return createReference(prefix);
  }

  protected normalizeMetadata(metadata?: MetadataMap): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    const entries = Object.entries(metadata).map(([key, value]) => [key, value === null ? "" : String(value)] as const);

    return Object.fromEntries(entries);
  }

  protected normalizeCustomerName(options: CustomerOptions | InitializeOptions["customer"]): string | undefined {
    return options?.name?.trim() || undefined;
  }

  protected wrapError(error: unknown, message: string) {
    return toPayBridgeError(error, {
      code: "GATEWAY_ERROR",
      gateway: this.gateway,
      message
    });
  }

  protected requireCustomerEmail(options: SubscriptionOptions): string {
    const email = options.customer?.email ?? options.email;

    if (!email) {
      throw new PayBridgeError({
        code: "INVALID_REQUEST",
        gateway: this.gateway,
        message: "A customer email is required for this subscription flow."
      });
    }

    return email;
  }
}
