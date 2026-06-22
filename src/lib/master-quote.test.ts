import {
  DEFAULT_PLATFORM_MARGIN_PCT,
  averageCostCents,
  computeTradePayoutCents,
  computeMasterTotalCents,
  isTradeUnlocked,
  type SequencedSlot,
} from './master-quote';

describe('averageCostCents', () => {
  it('averages and rounds to whole cents', () => {
    expect(averageCostCents(10000, 20000)).toBe(15000);
    expect(averageCostCents(10001, 10002)).toBe(10002); // 10001.5 -> rounds up
  });
});

describe('computeTradePayoutCents', () => {
  it('removes the default 10% margin from the average estimate', () => {
    // avg = 100000, payout = 90000
    expect(computeTradePayoutCents(80000, 120000)).toBe(90000);
  });

  it('honours an explicit margin', () => {
    expect(computeTradePayoutCents(100000, 100000, 0.2)).toBe(80000);
    expect(computeTradePayoutCents(100000, 100000, 0)).toBe(100000);
  });

  it('rounds to whole cents', () => {
    // avg = 33333 (66666/2 -> 33333), * 0.9 = 29999.7 -> 30000
    expect(computeTradePayoutCents(33333, 33333, 0.1)).toBe(30000);
  });

  it('payout is always ≤ the estimate average (margin is non-negative)', () => {
    const min = 12345;
    const max = 67890;
    const avg = averageCostCents(min, max);
    expect(computeTradePayoutCents(min, max)).toBeLessThanOrEqual(avg);
  });
});

describe('computeMasterTotalCents', () => {
  it('uses the average AI cost when it covers the payouts', () => {
    // avg AI = 100000, payouts (3 trades * 30000) = 90000 -> master = 100000, margin = 10000
    const master = computeMasterTotalCents({ aiMinCents: 80000, aiMaxCents: 120000, sumPayoutCents: 90000 });
    expect(master).toBe(100000);
    expect(master).toBeGreaterThanOrEqual(90000);
  });

  it('floors at Σ payouts so WalkerAI never charges less than it pays out', () => {
    // AI estimate is low/stale but payouts exceed it -> master bumps up to payouts
    const master = computeMasterTotalCents({ aiMinCents: 50000, aiMaxCents: 50000, sumPayoutCents: 95000 });
    expect(master).toBe(95000);
  });

  it('reuses a previously locked master total', () => {
    const master = computeMasterTotalCents({ aiMinCents: 80000, aiMaxCents: 120000, sumPayoutCents: 90000, existingMasterCents: 105000 });
    expect(master).toBe(105000);
  });

  it('still floors a stale locked total at Σ payouts', () => {
    const master = computeMasterTotalCents({ sumPayoutCents: 99000, existingMasterCents: 90000 });
    expect(master).toBe(99000);
  });

  it('falls back to Σ payouts when AI cost is missing', () => {
    const master = computeMasterTotalCents({ aiMinCents: null, aiMaxCents: null, sumPayoutCents: 70000 });
    expect(master).toBe(70000);
  });

  it('invariant: master ≥ Σ payouts for a full project', () => {
    const slots = [
      computeTradePayoutCents(40000, 60000), // 45000
      computeTradePayoutCents(20000, 30000), // 22500
      computeTradePayoutCents(10000, 10000), // 9000
    ];
    const sumPayouts = slots.reduce((a, b) => a + b, 0);
    const master = computeMasterTotalCents({ aiMinCents: 70000, aiMaxCents: 90000, sumPayoutCents: sumPayouts });
    expect(master).toBeGreaterThanOrEqual(sumPayouts);
  });
});

describe('DEFAULT_PLATFORM_MARGIN_PCT', () => {
  it('is 10%', () => {
    expect(DEFAULT_PLATFORM_MARGIN_PCT).toBe(0.10);
  });
});

describe('isTradeUnlocked', () => {
  const slots: SequencedSlot[] = [
    { work_order: 1, paid: false }, // demolition
    { work_order: 2, paid: false }, // electrical
    { work_order: 3, paid: false }, // tile
  ];

  it('unlocks only the first trade at the start', () => {
    expect(isTradeUnlocked(slots[0], slots)).toBe(true);
    expect(isTradeUnlocked(slots[1], slots)).toBe(false);
    expect(isTradeUnlocked(slots[2], slots)).toBe(false);
  });

  it('unlocks the next trade once the previous is paid', () => {
    const s: SequencedSlot[] = [
      { work_order: 1, paid: true },
      { work_order: 2, paid: false },
      { work_order: 3, paid: false },
    ];
    expect(isTradeUnlocked(s[1], s)).toBe(true);
    expect(isTradeUnlocked(s[2], s)).toBe(false); // trade 2 not yet paid
  });

  it('unlocks the last trade only when all earlier are paid', () => {
    const s: SequencedSlot[] = [
      { work_order: 1, paid: true },
      { work_order: 2, paid: true },
      { work_order: 3, paid: false },
    ];
    expect(isTradeUnlocked(s[2], s)).toBe(true);
  });

  it('treats slots without a work_order as unlocked', () => {
    const s: SequencedSlot[] = [
      { work_order: null, paid: false },
      { work_order: null, paid: false },
    ];
    expect(isTradeUnlocked(s[0], s)).toBe(true);
  });
});
