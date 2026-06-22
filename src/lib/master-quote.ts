/**
 * Master-quote payment math — single source of truth for the money rules.
 *
 * The Supabase edge functions (accept-job, create-payment-intent,
 * release-trade-payout) run on Deno and cannot import from `src/`, so they
 * carry inline copies of this logic. Keep them in sync with these functions;
 * the unit tests here lock the invariants (margin, rounding, Σ payouts ≤ master).
 *
 * All amounts are CAD cents (integers).
 */

export const DEFAULT_PLATFORM_MARGIN_PCT = 0.10;

/** Average of an AI estimate range, rounded to whole cents. */
export function averageCostCents(minCents: number, maxCents: number): number {
  return Math.round((minCents + maxCents) / 2);
}

/**
 * Per-trade payout locked at acceptance:
 *   payout = avg(slot estimate) × (1 − margin)
 * WalkerAI's margin is the implicit gap and is never shown to the homeowner.
 */
export function computeTradePayoutCents(
  estimateMinCents: number,
  estimateMaxCents: number,
  marginPct: number = DEFAULT_PLATFORM_MARGIN_PCT,
): number {
  const avg = averageCostCents(estimateMinCents, estimateMaxCents);
  return Math.round(avg * (1 - marginPct));
}

/**
 * Homeowner-facing master total (model a):
 *   base = avg(project AI cost); floored at Σ(trade payouts) so WalkerAI never
 *   charges the homeowner less than it pays out. A previously locked total is
 *   reused as-is when present.
 */
/**
 * Sequential trades — a slot is "unlocked" (its company may finish and be paid)
 * only once every earlier-ordered trade in the project is paid. Slots without a
 * work_order are treated as unordered/unlocked. Mirrored inline by
 * release-trade-payout (the authoritative money gate) and both milestone UIs.
 */
export interface SequencedSlot {
  work_order: number | null;
  paid: boolean;
}

export function isTradeUnlocked(slot: SequencedSlot, allSlots: SequencedSlot[]): boolean {
  if (slot.work_order == null) return true;
  const order = slot.work_order;
  return allSlots.every((s) => s.work_order == null || s.work_order >= order || s.paid);
}

export function computeMasterTotalCents(input: {
  aiMinCents?: number | null;
  aiMaxCents?: number | null;
  sumPayoutCents: number;
  existingMasterCents?: number | null;
}): number {
  const { aiMinCents, aiMaxCents, sumPayoutCents, existingMasterCents } = input;
  if (existingMasterCents && existingMasterCents > 0) {
    return Math.max(existingMasterCents, sumPayoutCents);
  }
  const base = (aiMinCents != null && aiMaxCents != null)
    ? averageCostCents(aiMinCents, aiMaxCents)
    : 0;
  return Math.max(base, sumPayoutCents);
}
