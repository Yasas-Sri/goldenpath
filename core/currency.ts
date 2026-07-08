import { Dataset, getNestedValue } from "./dataset";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: "$",
  LKR: "Rs.",
  EUR: "€",
  JPY: "¥",
  USD: "$",
  CAD: "$",
  NZD: "$",
  SGD: "$",
  AED: "د.إ",
};

export function getCountryCurrency(dataset: Dataset): string {
  const currency = getNestedValue(dataset, "metadata.currency");
  if (!currency) {
    throw new Error("Dataset metadata.currency is missing.");
  }
  return String(currency).toUpperCase().trim();
}

export function getCurrencySymbol(currency: string): string {
  const code = String(currency).toUpperCase().trim();
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function getExchangeRateKey(dataset: Dataset): string {
  const currency = getCountryCurrency(dataset);
  const expectedKey = `${currency.toLowerCase()}_to_lkr_exchange_rate`;

  const economySection = dataset["investment_and_economy"] ?? {};
  if (expectedKey in economySection) return expectedKey;
  if (currency === "LKR") return "lkr_to_lkr_exchange_rate";

  for (const key of Object.keys(economySection)) {
    if (String(key).toLowerCase().trim().endsWith("_to_lkr_exchange_rate")) {
      return String(key);
    }
  }

  throw new Error(
    `Exchange-rate field not found. Expected: investment_and_economy.${expectedKey}.value`
  );
}

export function getExchangeRateToLkr(dataset: Dataset): number {
  const currency = getCountryCurrency(dataset);
  const path = `investment_and_economy.${getExchangeRateKey(dataset)}.value`;
  const rate = getNestedValue(dataset, path);

  if (rate == null && currency === "LKR") return 1.0;

  const parsed = Number(rate);
  if (rate == null || Number.isNaN(parsed)) {
    throw new Error(`Invalid exchange-rate value at ${path}: ${rate}`);
  }
  if (parsed <= 0) {
    throw new Error(`Exchange rate must be greater than zero at ${path}.`);
  }
  return parsed;
}

export function convertLocalToLkr(
  amount: number,
  dataset: Dataset,
  exchangeRate?: number
): number {
  const rate = exchangeRate ?? getExchangeRateToLkr(dataset);
  return Number(amount) * Number(rate);
}

function formatAmount(value: any, decimals: number): string {
  let amount = Number(value);
  if (!Number.isFinite(amount)) amount = 0.0;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatLocalCurrency(
  value: any,
  dataset: Dataset | null = null,
  currency: string | null = null,
  decimals = 0
): string {
  let code = currency;
  if (code == null) {
    code = dataset == null ? "LOCAL" : getCountryCurrency(dataset);
  }
  code = String(code).toUpperCase().trim();
  const symbol = getCurrencySymbol(code);
  const formatted = formatAmount(value, decimals);

  if (symbol === code) return `${code} ${formatted}`;
  return `${code} ${symbol}${formatted}`;
}

export function formatLkr(value: any, decimals = 0): string {
  return `LKR Rs. ${formatAmount(value, decimals)}`;
}

export function formatLkrEquivalent(localValue: any, dataset: Dataset, decimals = 0): string {
  return formatLkr(convertLocalToLkr(Number(localValue), dataset), decimals);
}

export function formatCurrencyPair(localValue: any, dataset: Dataset, decimals = 0): string {
  return `${formatLocalCurrency(localValue, dataset, null, decimals)} | ${formatLkrEquivalent(localValue, dataset, decimals)}`;
}
