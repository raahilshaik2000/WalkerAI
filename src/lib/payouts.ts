export interface StripePayoutRecord {
  stripe_account_id?: string | null;
  stripe_details_submitted?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_transfers_active?: boolean | null;
}

export function hasStripeReadinessFields(record: StripePayoutRecord | null | undefined) {
  if (!record) return false;
  return record.stripe_details_submitted != null
    || record.stripe_payouts_enabled != null
    || record.stripe_transfers_active != null;
}

export function isStripePayoutLocallyReady(record: StripePayoutRecord | null | undefined) {
  if (!record) return false;
  if (!hasStripeReadinessFields(record)) {
    return !!record.stripe_account_id;
  }
  return !!record.stripe_details_submitted
    && !!record.stripe_payouts_enabled
    && !!record.stripe_transfers_active;
}
