export function materialOrderPaymentStatusLabel(status: string, formattedAmount: string): string {
  if (status === 'paid') return `${formattedAmount} paid`;
  if (status === 'confirmed') return `${formattedAmount} confirmed · payout processing`;
  return formattedAmount;
}

export function materialOrderPlatformFeeCents(
  finalPrice: number | null | undefined,
  platformFeePct: number | null | undefined,
): number {
  const price = Number(finalPrice ?? 0);
  const pct = Number(platformFeePct ?? 0);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(price * (pct / 100));
}

export function materialOrderNetPayoutCents(
  finalPrice: number | null | undefined,
  platformFeePct: number | null | undefined,
): number {
  const price = Number(finalPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.max(0, price - materialOrderPlatformFeeCents(price, platformFeePct));
}

export function joinedMaterialItemName(
  material: { item?: string | null } | Array<{ item?: string | null }> | null | undefined,
): string {
  const row = Array.isArray(material) ? material[0] : material;
  const item = row?.item?.trim();
  return item || 'Material';
}
