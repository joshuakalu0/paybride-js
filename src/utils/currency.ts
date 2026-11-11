import { paymentCurrencies, supportedCurrenciesByGateway } from "../constants";
import { PayBridgeError } from "../errors";
import type { GatewayName, PaymentCurrency } from "../types";

export function resolveCurrency(
  gateway: GatewayName,
  currency?: PaymentCurrency,
  defaultCurrency?: PaymentCurrency
): PaymentCurrency {
  const resolved = currency ?? defaultCurrency ?? "NGN";
  const supported = supportedCurrenciesByGateway[gateway];

  if (!supported.includes(resolved)) {
    throw new PayBridgeError({
      code: "UNSUPPORTED_CURRENCY",
      gateway,
      message: `${resolved} is not supported for ${gateway}.`
    });
  }

  return resolved;
}

export function getCurrencies(gateway: GatewayName): readonly PaymentCurrency[] {
  return supportedCurrenciesByGateway[gateway];
}

export function normalizeGatewayCurrency(currency?: string): PaymentCurrency | undefined {
  if (!currency) {
    return undefined;
  }

  const normalized = currency.toUpperCase();

  if (paymentCurrencies.includes(normalized as PaymentCurrency)) {
    return normalized as PaymentCurrency;
  }

  return undefined;
}
