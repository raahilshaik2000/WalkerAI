const DEFAULT_COMPANY_COMMISSION_RATE = 0.10;

export function companyCommissionRate(rate: number | null | undefined): number {
  const value = Number(rate ?? DEFAULT_COMPANY_COMMISSION_RATE);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_COMPANY_COMMISSION_RATE;
  if (value >= 1) return 1;
  return value;
}

export function companyEstimatedNetPayoutCents(
  grossAmount: number | null | undefined,
  commissionRate?: number | null,
): number {
  const amount = Number(grossAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(0, Math.round(amount * (1 - companyCommissionRate(commissionRate))));
}
