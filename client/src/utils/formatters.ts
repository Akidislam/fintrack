import type { SupportedCurrency } from '../types';

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: '$',
  BDT: '৳',
  EUR: '€',
  GBP: '£',
};

export const formatCurrency = (
  val: number,
  currency: SupportedCurrency = 'USD'
): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};
