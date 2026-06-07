export interface ActivatableSlot {
  id: string;
  assigned_company_id: string | null;
}

export interface ApprovedQuoteRef {
  slot_id?: string | null;
  company_id: string | null;
}

export function allSchedulableSlotsHaveApprovedQuotes(
  slots: ActivatableSlot[],
  quotes: ApprovedQuoteRef[],
) {
  const requiredSlots = slots.filter((slot) => !!slot.assigned_company_id);
  if (requiredSlots.length === 0) return false;

  const approvedSlotIds = new Set(
    quotes
      .map((quote) => quote.slot_id)
      .filter((id): id is string => !!id)
  );

  const companySlotCounts = requiredSlots.reduce<Record<string, number>>((counts, slot) => {
    if (slot.assigned_company_id) {
      counts[slot.assigned_company_id] = (counts[slot.assigned_company_id] ?? 0) + 1;
    }
    return counts;
  }, {});

  const legacyApprovedCompanyIds = new Set(
    quotes
      .filter((quote) => (
        !quote.slot_id &&
        !!quote.company_id &&
        companySlotCounts[quote.company_id] === 1
      ))
      .map((quote) => quote.company_id as string)
  );

  return requiredSlots.every((slot) => (
    approvedSlotIds.has(slot.id) ||
    (!!slot.assigned_company_id && legacyApprovedCompanyIds.has(slot.assigned_company_id))
  ));
}
