import { allSchedulableSlotsHaveApprovedQuotes } from '../src/lib/project-activation';

describe('project activation helpers', () => {
  const slots = [
    { id: 'slot-1', assigned_company_id: 'company-a' },
    { id: 'slot-2', assigned_company_id: 'company-b' },
  ];

  it('requires an approved quote for every assigned trade slot', () => {
    expect(allSchedulableSlotsHaveApprovedQuotes(slots, [
      { slot_id: 'slot-1', company_id: 'company-a' },
      { slot_id: 'slot-2', company_id: 'company-b' },
    ])).toBe(true);

    expect(allSchedulableSlotsHaveApprovedQuotes(slots, [
      { slot_id: 'slot-1', company_id: 'company-a' },
    ])).toBe(false);
  });

  it('supports older company-only quote rows only when the company has one slot', () => {
    expect(allSchedulableSlotsHaveApprovedQuotes(slots, [
      { company_id: 'company-a' },
      { company_id: 'company-b' },
    ])).toBe(true);

    expect(allSchedulableSlotsHaveApprovedQuotes([
      { id: 'slot-1', assigned_company_id: 'company-a' },
      { id: 'slot-2', assigned_company_id: 'company-a' },
    ], [
      { company_id: 'company-a' },
    ])).toBe(false);
  });
});
