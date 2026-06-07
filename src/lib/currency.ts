const MAX_POSTGRES_INTEGER = 2_147_483_647;

function normalizeCadDecimal(value: string): string {
  return value.trim().replace(/[٫٬,·•]/g, '.');
}

export function parseNonNegativeCadToCents(value: string): number | null {
  const normalized = normalizeCadDecimal(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_POSTGRES_INTEGER ? cents : null;
}

export function parsePositiveCadToCents(value: string): number | null {
  const cents = parseNonNegativeCadToCents(value);
  return cents != null && cents > 0 ? cents : null;
}

export function parseSignedCadToCents(value: string): number | null {
  const normalized = normalizeCadDecimal(value);
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && Math.abs(cents) <= MAX_POSTGRES_INTEGER ? cents : null;
}

export function formatCadCents(cents: number): string {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return '$0.00';

  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function formatSignedCadCents(cents: number): string {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return '+$0.00';
  return amount < 0 ? `-${formatCadCents(Math.abs(amount))}` : `+${formatCadCents(amount)}`;
}
