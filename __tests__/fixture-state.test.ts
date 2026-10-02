/**
 * Tests for buildExpectedRoomState — ensures questionnaire answers correctly
 * map to fixture states that drive renovation-aware prompting and validation.
 */

// Since the edge function uses Deno syntax, we need to extract the function for testing.
// We inline a testable version here that mirrors the implementation exactly.

type FixtureState = 'locked' | 'replace' | 'move' | 'remove' | 'add';
interface FixtureSpec { name: string; state: FixtureState; notes?: string; }
interface ExpectedRoomState { room_type: string; fixtures: FixtureSpec[]; forbidden_cross_room_items: string[]; }

function answerValue(answers: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = answers?.[key];
    if (typeof value === 'string' && value.trim()) return value.toLowerCase();
  }
  return '';
}

function buildExpectedRoomState(
  roomType: string,
  answers: Record<string, unknown> | null | undefined,
): ExpectedRoomState {
  const room = roomType.toLowerCase();
  const fixtures: FixtureSpec[] = [];

  if (room.includes('bath')) {
    const shower = answerValue(answers, 'b_shower');
    if (shower.includes('b_sh_walkin')) {
      fixtures.push({ name: 'bathtub', state: 'remove', notes: 'User selected walk-in shower only — tub must be absent' });
      fixtures.push({ name: 'walk-in shower', state: 'add', notes: 'Curbless or curbed walk-in shower replacing removed tub in original tub footprint' });
    } else if (shower.includes('b_sh_combo')) {
      fixtures.push({ name: 'tub/shower combo', state: 'replace', notes: 'Standard alcove or standalone tub/shower combo — new but same position' });
    } else if (shower.includes('b_sh_both')) {
      fixtures.push({ name: 'soaker tub', state: 'add', notes: 'Separate freestanding or alcove soaker tub' });
      fixtures.push({ name: 'separate shower enclosure', state: 'add', notes: 'Separate walk-in or framed shower' });
    } else {
      fixtures.push({ name: 'shower/tub', state: 'locked', notes: 'Keep existing shower and tub layout exactly as-is' });
    }

    const vanity = answerValue(answers, 'b_vanity');
    if (vanity.includes('b_van_double')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New double vanity with 2 sinks in original vanity footprint — do not swap with toilet' });
    } else if (vanity.includes('b_van_floating')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New floating / wall-mount vanity in original vanity footprint — do not swap with toilet' });
    } else if (vanity.includes('b_van_single')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New single vanity in original vanity footprint — do not swap with toilet' });
    } else {
      fixtures.push({ name: 'vanity', state: 'locked', notes: 'Keep and refinish existing vanity — same size and location, do not swap with toilet' });
    }

    const toilet = answerValue(answers, 'b_toilet');
    if (toilet.includes('b_toil_replace')) {
      fixtures.push({ name: 'toilet', state: 'replace', notes: 'New toilet at exact original rough-in location — do not swap with vanity' });
    } else {
      fixtures.push({ name: 'toilet', state: 'locked', notes: 'Keep existing toilet at exact original rough-in location — do not swap with vanity' });
    }

    return {
      room_type: roomType,
      fixtures,
      forbidden_cross_room_items: [
        'stove', 'cooktop', 'gas burner', 'oven', 'range', 'range hood',
        'kitchen sink', 'refrigerator', 'dishwasher', 'microwave',
      ],
    };
  }

  if (room.includes('kitchen')) {
    const cabinets = answerValue(answers, 'k_cabinets');
    if (cabinets.includes('k_cab_full')) {
      fixtures.push({ name: 'cabinets', state: 'replace', notes: 'Full new cabinet replacement' });
    } else if (cabinets.includes('k_cab_reface')) {
      fixtures.push({ name: 'cabinet doors and hardware', state: 'replace', notes: 'Refacing — new doors and hardware, existing boxes kept' });
      fixtures.push({ name: 'cabinet boxes', state: 'locked', notes: 'Existing cabinet carcasses remain in place' });
    } else if (cabinets.includes('k_cab_paint')) {
      fixtures.push({ name: 'cabinets', state: 'locked', notes: 'Paint/refinish only' });
    } else {
      fixtures.push({ name: 'cabinets', state: 'locked', notes: 'Keep as-is — no cabinet work' });
    }

    const appliances = answerValue(answers, 'k_appliances');
    if (appliances.includes('k_app_full')) {
      fixtures.push({ name: 'refrigerator', state: 'replace' });
      fixtures.push({ name: 'stove/range', state: 'replace', notes: 'Same location, new appliance' });
      fixtures.push({ name: 'dishwasher', state: 'replace' });
      fixtures.push({ name: 'range hood', state: 'replace' });
    } else if (appliances.includes('k_app_some')) {
      fixtures.push({ name: 'some appliances', state: 'replace', notes: 'Partial appliance replacement — keep existing positions' });
    } else {
      fixtures.push({ name: 'all appliances', state: 'locked', notes: 'Keep all existing appliances in exact locations' });
    }

    const ct = answerValue(answers, 'k_countertops');
    if (ct.includes('k_ct_keep') || !ct) {
      fixtures.push({ name: 'countertops', state: 'locked' });
    } else {
      fixtures.push({ name: 'countertops', state: 'replace', notes: `New ${ct.replace('k_ct_', '')} countertops` });
    }

    return { room_type: roomType, fixtures, forbidden_cross_room_items: [] };
  }

  return { room_type: roomType, fixtures: [], forbidden_cross_room_items: [] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildExpectedRoomState', () => {
  describe('Bathroom — Shower/Tub', () => {
    it('b_sh_walkin → bathtub removed, walk-in shower added', () => {
      const state = buildExpectedRoomState('bathroom', { b_shower: 'b_sh_walkin' });
      const tub = state.fixtures.find(f => f.name === 'bathtub');
      const shower = state.fixtures.find(f => f.name === 'walk-in shower');
      expect(tub?.state).toBe('remove');
      expect(shower?.state).toBe('add');
    });

    it('b_sh_keep → shower/tub locked', () => {
      const state = buildExpectedRoomState('bathroom', { b_shower: 'b_sh_keep' });
      const locked = state.fixtures.find(f => f.name === 'shower/tub');
      expect(locked?.state).toBe('locked');
    });

    it('b_sh_both → soaker tub and separate shower both added', () => {
      const state = buildExpectedRoomState('bathroom', { b_shower: 'b_sh_both' });
      const tub = state.fixtures.find(f => f.name === 'soaker tub');
      const shower = state.fixtures.find(f => f.name === 'separate shower enclosure');
      expect(tub?.state).toBe('add');
      expect(shower?.state).toBe('add');
    });

    it('b_sh_combo → tub/shower combo replaced (not removed)', () => {
      const state = buildExpectedRoomState('bathroom', { b_shower: 'b_sh_combo' });
      const combo = state.fixtures.find(f => f.name === 'tub/shower combo');
      expect(combo?.state).toBe('replace');
    });
  });

  describe('Bathroom — Vanity', () => {
    it('b_van_double → vanity replaced with 2-sink notes', () => {
      const state = buildExpectedRoomState('bathroom', { b_vanity: 'b_van_double' });
      const vanity = state.fixtures.find(f => f.name === 'vanity');
      expect(vanity?.state).toBe('replace');
      expect(vanity?.notes).toMatch(/2 sinks/);
    });

    it('b_van_keep → vanity locked', () => {
      const state = buildExpectedRoomState('bathroom', { b_vanity: 'b_van_keep' });
      const vanity = state.fixtures.find(f => f.name === 'vanity');
      expect(vanity?.state).toBe('locked');
    });

    it('b_van_floating → vanity replaced as floating', () => {
      const state = buildExpectedRoomState('bathroom', { b_vanity: 'b_van_floating' });
      const vanity = state.fixtures.find(f => f.name === 'vanity');
      expect(vanity?.state).toBe('replace');
      expect(vanity?.notes).toMatch(/floating/i);
    });
  });

  describe('Bathroom — Cross-room ban', () => {
    it('bathroom always bans kitchen appliances', () => {
      const state = buildExpectedRoomState('bathroom', {});
      expect(state.forbidden_cross_room_items).toContain('stove');
      expect(state.forbidden_cross_room_items).toContain('cooktop');
      expect(state.forbidden_cross_room_items).toContain('oven');
      expect(state.forbidden_cross_room_items).toContain('refrigerator');
      expect(state.forbidden_cross_room_items).toContain('dishwasher');
    });
  });

  describe('Kitchen — Appliances', () => {
    it('k_app_none → all appliances locked', () => {
      const state = buildExpectedRoomState('kitchen', { k_appliances: 'k_app_none' });
      const locked = state.fixtures.find(f => f.name === 'all appliances');
      expect(locked?.state).toBe('locked');
    });

    it('k_app_full → individual appliances replaced at same location', () => {
      const state = buildExpectedRoomState('kitchen', { k_appliances: 'k_app_full' });
      const stove = state.fixtures.find(f => f.name === 'stove/range');
      const fridge = state.fixtures.find(f => f.name === 'refrigerator');
      const hood = state.fixtures.find(f => f.name === 'range hood');
      expect(stove?.state).toBe('replace');
      expect(fridge?.state).toBe('replace');
      expect(hood?.state).toBe('replace');
    });

    it('kitchen has empty forbidden_cross_room_items', () => {
      const state = buildExpectedRoomState('kitchen', {});
      expect(state.forbidden_cross_room_items).toHaveLength(0);
    });
  });

  describe('Kitchen — Cabinets', () => {
    it('k_cab_reface → cabinet doors replaced, boxes locked', () => {
      const state = buildExpectedRoomState('kitchen', { k_cabinets: 'k_cab_reface' });
      const doors = state.fixtures.find(f => f.name === 'cabinet doors and hardware');
      const boxes = state.fixtures.find(f => f.name === 'cabinet boxes');
      expect(doors?.state).toBe('replace');
      expect(boxes?.state).toBe('locked');
    });
  });

  describe('Bathroom — Layout Preserving & Fixture Anchoring', () => {
    it('toilet and vanity notes explicitly forbid swapping positions', () => {
      const state = buildExpectedRoomState('bathroom', { b_vanity: 'b_van_single', b_toilet: 'b_toil_replace' });
      const vanity = state.fixtures.find(f => f.name === 'vanity');
      const toilet = state.fixtures.find(f => f.name === 'toilet');

      expect(vanity?.notes).toContain('do not swap with toilet');
      expect(toilet?.notes).toContain('do not swap with vanity');
    });

    it('locked toilet keeps exact original rough-in location', () => {
      const state = buildExpectedRoomState('bathroom', { b_toilet: 'b_toil_keep' });
      const toilet = state.fixtures.find(f => f.name === 'toilet');
      expect(toilet?.state).toBe('locked');
      expect(toilet?.notes).toContain('exact original rough-in location');
    });

    it('walk-in shower anchors to original tub footprint', () => {
      const state = buildExpectedRoomState('bathroom', { b_shower: 'b_sh_walkin' });
      const shower = state.fixtures.find(f => f.name === 'walk-in shower');
      expect(shower?.notes).toContain('original tub footprint');
    });
  });

  describe('Fallback', () => {
    it('unknown room type returns empty state', () => {
      const state = buildExpectedRoomState('living_room', {});
      expect(state.fixtures).toHaveLength(0);
      expect(state.forbidden_cross_room_items).toHaveLength(0);
    });

    it('null answers still returns valid state structure', () => {
      const state = buildExpectedRoomState('bathroom', null);
      expect(state.room_type).toBe('bathroom');
      expect(Array.isArray(state.fixtures)).toBe(true);
      expect(Array.isArray(state.forbidden_cross_room_items)).toBe(true);
    });
  });
});
