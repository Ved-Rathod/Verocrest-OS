// Cost-formatting helpers for the AI Usage dashboard. AI spend is often
// sub-dollar (a summarize call is ~$0.003), so this uses more precision than
// the lead deal-value formatter (which rounds to whole currency units).

export function formatUsd(value: number): string {
  const decimals = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatInt(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}
