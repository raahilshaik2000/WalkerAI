import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Fast photoreal image-edit model on Fal (fallback). */
const FAL_MODEL = 'fal-ai/flux-2/flash/edit';

/** The intended state of a fixture after the renovation is complete. */
type FixtureState = 'locked' | 'replace' | 'move' | 'remove' | 'add';

/**
 * Describes one fixture and what the homeowner has approved happening to it.
 * Used to generate accurate prompts and validate renders against approved changes.
 */
interface FixtureSpec {
  name: string;         // Human-readable: "tub", "walk-in shower", "vanity", etc.
  state: FixtureState;
  notes?: string;       // Optional detail, e.g. "curbless walk-in replacing tub"
}

/**
 * The complete expected state of the room after renovation, derived from
 * the homeowner's questionnaire answers. The validator compares the generated
 * render against this, NOT against the original source photo.
 */
interface ExpectedRoomState {
  room_type: string;
  fixtures: FixtureSpec[];
  forbidden_cross_room_items: string[]; // Items that must never appear regardless of answers
}

interface StyleParams {
  design_style: string;
  material_tier: string;
  room_type: string;
  provider: 'openai' | 'fal';
  prompt?: string;
  dimensions_summary?: string | null;
  surface_selections_summary?: string | null;
  expected_room_state?: ExpectedRoomState | null;
}


function answerValue(answers: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = answers?.[key];
    if (typeof value === 'string' && value.trim()) return value.toLowerCase();
  }
  return '';
}

function extractDesignStyle(answers: Record<string, unknown> | null | undefined): string {
  const styleAnswer = answerValue(answers, 'k_style', 'b_style', 'style');
  if (styleAnswer.includes('spa')) return 'spa';
  if (styleAnswer.includes('traditional')) return 'traditional';
  if (styleAnswer.includes('transitional')) return 'transitional';
  if (styleAnswer.includes('farmhouse')) return 'farmhouse';
  if (styleAnswer.includes('industrial')) return 'industrial';
  if (styleAnswer.includes('contemporary')) return 'contemporary';
  if (styleAnswer.includes('modern')) return 'modern';
  return 'modern';
}

function extractMaterialTier(answers: Record<string, unknown> | null | undefined): string {
  const tierAnswer = answerValue(answers, 'k_tier', 'b_tier', 'quality_tier');
  if (tierAnswer.includes('luxury')) return 'luxury';
  if (tierAnswer.includes('mid')) return 'mid-range';
  return 'budget';
}

/**
 * Derives the expected final room state from the homeowner's questionnaire answers.
 * Each fixture is tagged with its approved state: locked | replace | move | remove | add.
 * The validator and prompt builder both use this — NOT the source photo — as ground truth.
 */
export function buildExpectedRoomState(
  roomType: string,
  answers: Record<string, unknown> | null | undefined,
): ExpectedRoomState {
  const room = roomType.toLowerCase();
  const fixtures: FixtureSpec[] = [];

  if (room.includes('bath')) {
    // ── Shower / Tub ──────────────────────────────────────────────────────────
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
      // b_sh_keep or not answered
      fixtures.push({ name: 'shower/tub', state: 'locked', notes: 'Keep existing shower and tub layout exactly as-is' });
    }

    // ── Vanity ────────────────────────────────────────────────────────────────
    const vanity = answerValue(answers, 'b_vanity');
    if (vanity.includes('b_van_double')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New double vanity with 2 sinks in original vanity footprint — do not swap with toilet' });
    } else if (vanity.includes('b_van_floating')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New floating / wall-mount vanity in original vanity footprint — do not swap with toilet' });
    } else if (vanity.includes('b_van_single')) {
      fixtures.push({ name: 'vanity', state: 'replace', notes: 'New single vanity in original vanity footprint — do not swap with toilet' });
    } else {
      // b_van_keep or not answered
      fixtures.push({ name: 'vanity', state: 'locked', notes: 'Keep and refinish existing vanity — same size and location, do not swap with toilet' });
    }

    // ── Toilet ────────────────────────────────────────────────────────────────
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
    // ── Cabinets ──────────────────────────────────────────────────────────────
    const cabinets = answerValue(answers, 'k_cabinets');
    if (cabinets.includes('k_cab_full')) {
      fixtures.push({ name: 'cabinets', state: 'replace', notes: 'Full new cabinet replacement' });
    } else if (cabinets.includes('k_cab_reface')) {
      fixtures.push({ name: 'cabinet doors and hardware', state: 'replace', notes: 'Refacing — new doors and hardware, existing boxes kept' });
      fixtures.push({ name: 'cabinet boxes', state: 'locked', notes: 'Existing cabinet carcasses remain in place' });
    } else if (cabinets.includes('k_cab_paint')) {
      fixtures.push({ name: 'cabinets', state: 'locked', notes: 'Paint/refinish only — same cabinets, may look different colour' });
    } else {
      fixtures.push({ name: 'cabinets', state: 'locked', notes: 'Keep as-is — no cabinet work' });
    }

    // ── Appliances ────────────────────────────────────────────────────────────
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

    // ── Countertops ───────────────────────────────────────────────────────────
    const ct = answerValue(answers, 'k_countertops');
    if (ct.includes('k_ct_keep') || !ct) {
      fixtures.push({ name: 'countertops', state: 'locked' });
    } else {
      fixtures.push({ name: 'countertops', state: 'replace', notes: `New ${ct.replace('k_ct_', '')} countertops` });
    }

    return {
      room_type: roomType,
      fixtures,
      forbidden_cross_room_items: [], // kitchen appliances are allowed in kitchens
    };
  }

  // Fallback for unknown room types
  return {
    room_type: roomType,
    fixtures: [],
    forbidden_cross_room_items: [],
  };
}


/**
 * Defines rich, style-specific aesthetic guidance for each design theme.
 * Keeps fixture positions locked while generating distinct, high-quality finishes.
 */
export function getStyleFinishGuidance(style: string, roomType: string): string {
  const isBath = roomType.toLowerCase().includes('bath');
  const cleanStyle = style.toLowerCase().replace(/-refresh$/, '').replace(/-/g, ' ').trim();

  if (isBath) {
    switch (cleanStyle) {
      case 'spa':
        return 'SPA STYLE: Organic, tranquil sanctuary aesthetic. Warm natural oak or teak vanity cabinet (anchored in its original footprint), textured stone-look or zellige wall tile, matte honed floor tile, brushed brass or soft champagne bronze plumbing fixtures, warm ambient LED backlit mirror, soft calming earth and warm neutral tones. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'contemporary':
        return 'CONTEMPORARY STYLE: Sleek slab-door vanity cabinet (anchored in its original footprint), large-format porcelain wall tile, minimalist frameless glass shower enclosure, matte black or brushed graphite plumbing hardware, modern architectural mirror with integrated lighting, neutral monochrome palette with crisp contrast. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'traditional':
        return 'TRADITIONAL STYLE: Classic shaker or detailed wood vanity (anchored in its original footprint), timeless white or marble-veined subway wall tile, basketweave or hex floor tile, polished chrome or antique brass hardware, framed traditional mirror, classic wall sconces, elegant warm white or soft grey tones. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'transitional':
        return 'TRANSITIONAL STYLE: Balanced blend of traditional warmth and modern simplicity. Clean shaker vanity (anchored in its original footprint), soft marble-look quartz surfaces, neutral porcelain tile, brushed nickel or warm brass plumbing fixtures, clean framed mirror, balanced modern-classic lighting. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'farmhouse':
        return 'FARMHOUSE STYLE: Warm modern farmhouse aesthetic. Shaker or beadboard vanity (anchored in its original footprint), artisan glazed subway or herringbone tile, matte black or antique bronze hardware, round wood or black metal framed mirror, vintage-inspired vanity sconces. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'industrial':
        return 'INDUSTRIAL STYLE: Modern industrial aesthetic. Concrete-look or dark slate tile, reclaimed-wood style vanity (anchored in its original footprint), matte black metal frames and hardware, exposed filament vanity lighting, clean minimalist grid mirror. FIXTURE POSITIONS MUST NOT MOVE.';
      case 'modern':
      default:
        return 'MODERN STYLE: Clean minimalist aesthetic. Floating or flat-panel vanity (anchored in its original footprint), large-format seamless porcelain tile, frameless glass shower enclosure, matte black or brushed nickel hardware, backlit LED frameless mirror, bright neutral palette. FIXTURE POSITIONS MUST NOT MOVE.';
    }
  }

  // Kitchen styles
  switch (cleanStyle) {
    case 'contemporary':
      return 'CONTEMPORARY STYLE: Flat-slab cabinet doors, waterfall quartz countertops, modern minimal backsplash, integrated sleek appliances, matte black or brushed brass hardware.';
    case 'traditional':
      return 'TRADITIONAL STYLE: Raised panel or classic shaker cabinetry, granite or marble countertops, classic subway or glazed tile backsplash, traditional crown molding, warm brass or polished chrome pulls.';
    case 'transitional':
      return 'TRANSITIONAL STYLE: Simple shaker cabinets, neutral quartz countertops, ceramic tile backsplash, brushed nickel hardware, harmonious neutral warm-cool balance.';
    case 'farmhouse':
      return 'FARMHOUSE STYLE: White or muted tone shaker cabinets, apron-front sink, butcher block or quartz counters, subway tile backsplash, matte black cup pulls and hardware.';
    case 'industrial':
      return 'INDUSTRIAL STYLE: Dark or wood-tone flat cabinetry, concrete-look quartz countertops, exposed hardware accents, stainless or black fixtures, textured tile backsplash.';
    case 'modern':
    default:
      return 'MODERN STYLE: Handle-free or slim-pull flat panel cabinets, clean quartz countertops, slab or large tile backsplash, concealed minimalist appliances.';
  }
}

/** Keep fixture counts coherent and enforce the approved renovation change set. */
function fixtureIntegrityGuidance(roomType: string, expectedRoomState?: ExpectedRoomState | null): string {
  const room = roomType.replace(/_/g, ' ').toLowerCase();
  if (room.includes('kitchen')) {
    const kitchenRules = [
      'Keep the exact sink and faucet count from the source photo — typically one primary sink with one faucet at that sink.',
      'Do not invent a second sink, second faucet, mirrored faucet, or duplicate pot-filler.',
      'Keep appliance count and placement strictly coherent: standard kitchens have exactly ONE cooking area (either one range, or one cooktop with at most one oven stack). NEVER scatter multiple ovens across different walls or embed extra ovens into upper cabinets. Strictly avoid duplicate or triplicate ovens.',
      'CRITICAL FIXTURE AND APPLIANCE LOCATIONS: Keep the sink and stove in their exact original locations from the source photo. NEVER swap the sink and stove. NEVER place a sink or faucet where the stove is, and NEVER place a stove where the sink is. Plumbing and cooking rough-in locations must not be moved.',
      'Do not invent windows on solid interior walls or move the sink under a newly invented window.',
      'CRITICAL: Preserve all doors, doorways, and windows exactly as doors and windows. Do NOT replace any door or doorway with tall cabinets, pantries, or wall ovens. If there is a door in the source photo, it must remain an actual opening door, never an appliance or cabinetry.',
    ];

    if (expectedRoomState?.fixtures.length) {
      const locked = expectedRoomState.fixtures.filter(f => f.state === 'locked');
      const toReplace = expectedRoomState.fixtures.filter(f => f.state === 'replace');
      if (locked.length) kitchenRules.push(`APPROVED RENOVATION SCOPE — Locked (keep exactly): ${locked.map(f => f.name).join(', ')}.`);
      if (toReplace.length) kitchenRules.push(`APPROVED RENOVATION SCOPE — Replace (new appearance, same location): ${toReplace.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`);
    }

    return kitchenRules.join(' ');
  }

  if (room.includes('bath')) {
    const crossRoomBan = [
      'CRITICAL ROOM TYPE — THIS IS A BATHROOM. NEVER place any kitchen appliance in a bathroom under any circumstances.',
      'Strictly prohibited in bathroom renders: stove, cooktop, gas burner, oven, range, range hood, kitchen sink, refrigerator, dishwasher, microwave.',
    ];

    const layoutLockRules = [
      'CRITICAL FIXTURE ANCHOR & STRICT NO-SWAP RULE:',
      '1. NEVER SWAP TOILET AND VANITY: The vanity must remain on the exact same wall and footprint where the vanity is in the source photo. The toilet must remain on the exact same plumbing wall / rough-in where the toilet is in the source photo. NEVER put a toilet where the vanity was, and NEVER put a vanity where the toilet was.',
      '2. TUB / SHOWER LOCATION LOCKED: Bathtub or walk-in shower must stay within the exact footprint of the original tub/shower area. Do not move plumbing rough-ins to a different wall.',
      '3. GEOMETRY LOCKED: Copy the exact number of doors and windows from the source photo. Do NOT add new windows. Do NOT add new doors. Do NOT add new wall openings. If the source photo has zero windows, the render must have zero windows. If the source photo has one door, the render must show only one door.',
      '4. ROOM ENVELOPE: Preserve the exact camera angle, perspective, wall positions, ceiling height, and room proportions. Do not widen or alter the room dimensions.',
      'WHAT SHOULD CHANGE: Wall tile, floor tile, shower/tub surround tile, wall paint colour, vanity cabinet finish/colour/door style (WITHOUT moving its position or changing footprint), countertop material, mirror style, bathroom lighting fixtures, faucet and plumbing hardware finish, towel bars and accessories.',
      'WHAT MUST NOT MOVE: Toilet position, vanity position, shower/tub footprint, plumbing layout, doors, and windows.',
    ];

    if (expectedRoomState?.fixtures.length) {
      // Build renovation-specific instructions from approved change set
      const removals = expectedRoomState.fixtures.filter(f => f.state === 'remove');
      const additions = expectedRoomState.fixtures.filter(f => f.state === 'add');
      const replacements = expectedRoomState.fixtures.filter(f => f.state === 'replace');
      const locked = expectedRoomState.fixtures.filter(f => f.state === 'locked');

      const renovationRules: string[] = [];
      if (removals.length) {
        renovationRules.push(
          `APPROVED REMOVALS — The following must NOT appear anywhere in the render: ${removals.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`
        );
      }
      if (additions.length) {
        renovationRules.push(
          `APPROVED ADDITIONS — The following must clearly appear in the render: ${additions.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`
        );
      }
      if (replacements.length) {
        renovationRules.push(
          `APPROVED REPLACEMENTS — Same location, new appearance: ${replacements.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`
        );
      }
      if (locked.length) {
        renovationRules.push(
          `LOCKED FIXTURES — Must remain exactly as in the source photo: ${locked.map(f => f.name).join(', ')}.`
        );
      }

      // ── Vanity count enforcement ──────────────────────────────────────────
      // Derive the expected vanity count from the approved fixture states so
      // the AI cannot invent a second vanity in a small bathroom.
      const vanityFixture = expectedRoomState.fixtures.find(f => f.name === 'vanity');
      const doubleVanity = expectedRoomState.fixtures.find(
        f => f.name === 'vanity' && f.notes && f.notes.toLowerCase().includes('2 sinks')
      );
      let vanityCountRule: string;
      if (doubleVanity) {
        vanityCountRule = 'VANITY COUNT: Exactly TWO sinks on ONE double-vanity unit — do NOT place separate vanities on opposite walls.';
      } else if (vanityFixture) {
        vanityCountRule = 'VANITY COUNT: Exactly ONE vanity with ONE sink. Do NOT place a second vanity, second sink, or second faucet anywhere in the render — not on the opposite wall, not in a corner, not anywhere. This is a small bathroom.';
      } else {
        vanityCountRule = 'VANITY COUNT: Match the vanity count from the source photo exactly. Do not add extra vanities.';
      }

      return [...crossRoomBan, ...layoutLockRules, ...renovationRules, vanityCountRule].join(' ');
    }

    // Fallback when no questionnaire answers provided
    return [
      ...crossRoomBan,
      ...layoutLockRules,
      'A bathroom contains ONLY bathroom fixtures: toilet, bathtub or shower, vanity sink with bathroom faucet, mirrors, towel bars, bathroom lighting.',
      'VANITY COUNT: Exactly ONE vanity with ONE sink. Do NOT place a second vanity or second sink anywhere in the render — not on the opposite wall, not in any corner.',
      'Do not invent a second vanity faucet or duplicate shower/tub fixtures unless they already exist in the source photo.',
    ].join(' ');
  }

  return 'Preserve the exact fixture, appliance, door, and window count from the source photo; do not replace doors with cabinets or appliances.';
}


function formatDimensionsSummary(measurements: Record<string, unknown> | null | undefined): string | null {
  if (!measurements || typeof measurements !== 'object') return null;
  const length = measurements.lengthFt || measurements.length_ft;
  const width = measurements.widthFt || measurements.width_ft;
  const height = measurements.ceilingHeightFt || measurements.ceiling_height_ft;
  if (length && width) {
    const l = parseFloat(String(length));
    const w = parseFloat(String(width));
    const sqft = !isNaN(l) && !isNaN(w) ? Math.round(l * w) : null;
    const hStr = height ? ` with ${height}' ceiling` : '';
    const sqftStr = sqft ? ` (${sqft} sq ft)` : '';
    return `${length}' x ${width}'${hStr}${sqftStr}`;
  }
  return null;
}

function formatSurfaceSelectionsSummary(surfaceSelections: unknown): string | null {
  if (!surfaceSelections) return null;
  const items: string[] = [];
  if (Array.isArray(surfaceSelections)) {
    for (const item of surfaceSelections) {
      if (item && typeof item === 'object') {
        const label = String(item.surfaceLabel || item.surface_label || item.surfaceId || item.surface_id || 'Finish');
        const mat = String(item.material || item.name || '');
        const color = String(item.colorName || item.color_name || '');
        const desc = [mat, color].filter(Boolean).join(' in ');
        if (desc) items.push(`${label}: ${desc}`);
      }
    }
  } else if (typeof surfaceSelections === 'object') {
    for (const [key, val] of Object.entries(surfaceSelections as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const item = val as Record<string, unknown>;
        const label = String(item.surfaceLabel || item.surface_label || key);
        const mat = String(item.material || item.name || '');
        const color = String(item.colorName || item.color_name || '');
        const desc = [mat, color].filter(Boolean).join(' in ');
        if (desc) items.push(`${label}: ${desc}`);
      }
    }
  }
  return items.length > 0 ? items.join(', ') : null;
}

function buildDesignPrompt(params: StyleParams): string {
  const room = params.room_type.replace(/_/g, ' ');
  const style = params.design_style;
  const tier =
    params.material_tier === 'luxury'
      ? 'luxury high-end finishes'
      : params.material_tier === 'budget'
        ? 'affordable clean finishes'
        : 'mid-range quality finishes';

  const dimText = params.dimensions_summary
    ? ` Exact room dimensions: ${params.dimensions_summary}.`
    : '';
  const surfaceText = params.surface_selections_summary
    ? ` User-selected products & finishes: ${params.surface_selections_summary}.`
    : '';

  const roomLower = params.room_type.toLowerCase();
  const isBath = roomLower.includes('bath');
  const crossRoomGuard = isBath
    ? 'ABSOLUTE RULE: This room is a BATHROOM. DO NOT include ANY kitchen appliances (stove, cooktop, oven, gas burner, range, range hood, kitchen sink, refrigerator, dishwasher, microwave) anywhere in this render.'
    : '';

  const fixturePositionsLock = isBath
    ? 'CRITICAL FIXTURE ANCHOR: Keep the vanity on the exact same wall and footprint where it appears in the photo. Keep the toilet on the exact same wall and rough-in location where it appears in the photo. NEVER swap the toilet and vanity positions. Keep bathtub/shower in its original footprint. Single vanity stays single vanity.'
    : 'Maintain original fixture and appliance positions: keep the sink on the exact plumbing wall shown, and keep the cooktop/stove on its original wall. Never swap the sink and stove positions.';

  return [
    `Photorealistic finished ${room} renovation redesign of this exact room photo.${dimText}`,
    `Apply a complete ${style} interior design with ${tier}.${surfaceText}`,
    getStyleFinishGuidance(style, params.room_type),
    crossRoomGuard,
    'Keep the exact same camera angle, room envelope, wall positions, window and door placement, and overall geometry.',
    'Do not collapse walls, change room scale, or invent a different floor plan.',
    'Doors and entryways must remain doors; never place an oven, appliance, or tall cabinet where a doorway or door exists.',
    fixturePositionsLock,
    'Do not invent new windows or doors that do not exist in the source photo.',
    'Show finished cabinets, countertops, flooring, backsplash, or wall finishes matching the specified dimensions and user-selected materials.',
    fixtureIntegrityGuidance(params.room_type, params.expected_room_state),
    'Natural lighting, realistic materials and textures, sharp focus, high detail, empty room with no people, no text, no watermark.',
  ].filter(Boolean).join(' ');
}

/**
 * Builds a geometry-locked prompt for Refresh Mode (force=true, no style_override).
 * Refresh Mode changes surface finishes only — it must never move walls, add windows/doors,
 * or relocate fixtures. The room geometry is treated as verified and immutable.
 */
function buildRefreshModePrompt(params: StyleParams): string {
  const room = params.room_type.replace(/_/g, ' ');
  const style = params.design_style.replace(/-refresh$/, '').replace(/-/g, ' ');
  const tier =
    params.material_tier === 'luxury'
      ? 'luxury high-end finishes'
      : params.material_tier === 'budget'
        ? 'affordable clean finishes'
        : 'mid-range quality finishes';

  const dimConstraint = params.dimensions_summary
    ? `VERIFIED SCANNED DIMENSIONS: ${params.dimensions_summary} — do not alter room proportions or scale.`
    : '';

  const roomLower = params.room_type.toLowerCase();
  const isBath = roomLower.includes('bath');
  const crossRoomGuard = isBath
    ? 'ABSOLUTE RULE: This is a BATHROOM. DO NOT include any kitchen appliances (stove, cooktop, oven, gas burner, range, range hood, kitchen sink, refrigerator, dishwasher, microwave) anywhere in this render.'
    : '';

  return [
    `Photorealistic ${room} renovation render — REFRESH MODE. Apply a fresh ${style} style with ${tier}.`,

    // ── Hard geometry locks ────────────────────────────────────────────────
    'GEOMETRY LOCKED — This room was measured by LiDAR scan. The following are STRICTLY FORBIDDEN:',
    '1. Adding any new doors, windows, or wall openings that do not exist in the source photo.',
    '2. Removing, moving, or resizing any existing doors, windows, or walls.',
    '3. Changing the room shape, ceiling height, or overall floor plan.',
    '4. Relocating any plumbing fixture (sink, toilet, shower, tub) to a different wall or swapping fixture positions. In bathrooms: NEVER SWAP TOILET AND VANITY.',
    '5. Moving the stove, cooktop, or any fixed appliance to a different wall or position.',

    // ── What IS allowed ────────────────────────────────────────────────────
    'ALLOWED CHANGES (surface finishes only):',
    getStyleFinishGuidance(style, params.room_type),
    'New tile colour and pattern, new paint colour, new cabinetry colour or door style (keeping vanity in exact original location), new countertop material, new fixture finishes (faucet, hardware), new mirror style, new lighting, new flooring material.',
    'Do NOT change the shape, position, or count of any cabinet, vanity, fixture, or appliance.',

    dimConstraint,
    crossRoomGuard,
    fixtureIntegrityGuidance(params.room_type, params.expected_room_state),

    'Keep the exact same camera angle, wall positions, and room envelope from the source photo.',
    'Natural lighting, realistic materials and textures, sharp focus, high detail, empty room with no people, no text, no watermark.',
  ].filter(Boolean).join(' ');
}

/**
 * Builds a short, change-focused prompt for image-edit APIs (gpt-image-1 / dall-e-2 edits).
 * Unlike buildDesignPrompt which describes the whole room, this only describes WHAT TO CHANGE
 * and explicitly tells the model to keep everything else exactly as-is.
 * This is the correct prompt style for true image-to-image editing.
 */
function buildEditPrompt(params: StyleParams): string {
  const room = params.room_type.replace(/_/g, ' ');
  const style = params.design_style.replace(/-refresh$/, '').replace(/-/g, ' ');
  const tier =
    params.material_tier === 'luxury'
      ? 'luxury high-end'
      : params.material_tier === 'budget'
        ? 'affordable'
        : 'mid-range';

  const state = params.expected_room_state;
  const roomLower = params.room_type.toLowerCase();
  const isBath = roomLower.includes('bath');

  const changeParts: string[] = [];
  if (state?.fixtures.length) {
    const removals = state.fixtures.filter(f => f.state === 'remove');
    const additions = state.fixtures.filter(f => f.state === 'add');
    const replacements = state.fixtures.filter(f => f.state === 'replace');
    if (removals.length) changeParts.push(`Remove: ${removals.map(f => f.name).join(', ')}.`);
    if (additions.length) changeParts.push(`Add in its place: ${additions.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`);
    if (replacements.length) changeParts.push(`Replace with new ${tier} finish at same location: ${replacements.map(f => `${f.name}${f.notes ? ` (${f.notes})` : ''}`).join(', ')}.`);
  }
  changeParts.push(getStyleFinishGuidance(style, params.room_type));

  const fixtureLock = isBath
    ? 'CRITICAL FIXTURE ANCHOR: The vanity must remain on the exact same wall and footprint as in the photo. The toilet must remain in its exact photographed location. NEVER swap the toilet and vanity positions. Tub/shower must stay in its original footprint. Keep exact vanity count (single vanity stays single vanity). Do not move plumbing rough-ins.'
    : 'CRITICAL FIXTURE ANCHOR: Keep sink and stove on their exact photographed walls and locations. Never swap sink and stove. All doors must remain functional passage doors.';

  const bathroomBan = isBath
    ? 'This is a BATHROOM — absolutely no kitchen appliances (stove, cooktop, oven, refrigerator, dishwasher) anywhere.'
    : '';

  return [
    `Edit this ${room} photo into a ${style} renovation design with ${tier} finishes.`,
    changeParts.join(' '),
    fixtureLock,
    bathroomBan,
    'PRESERVE EXACTLY: all walls, doors, windows, room shape, ceiling height, camera angle, plumbing rough-in locations, and fixture positions not listed above.',
    'Do NOT add new windows. Do NOT add new doors. Do NOT move any plumbing wall. Do NOT change room width or depth.',
    `Photorealistic, ${tier} materials, natural lighting, empty room, no people, no text, no watermark.`,
  ].filter(Boolean).join(' ');
}

function buildSurfaceEditPrompt(params: {
  room_type: string;
  surface_label: string;
  material: string;
  color_name?: string | null;
  brand?: string | null;
  sku?: string | null;
  has_product_image?: boolean;
}): string {
  const room = params.room_type.replace(/_/g, ' ');
  const surface = params.surface_label.trim() || 'surface';
  const material = params.material.trim() || 'updated material';
  const color = params.color_name?.trim();
  const brand = params.brand?.trim();
  const sku = params.sku?.trim();
  const productBits = [brand, sku ? `SKU ${sku}` : null, color].filter(Boolean).join(', ');
  const referenceLine = params.has_product_image
    ? 'A second reference image shows the exact supplier product finish — match that colour, pattern, and sheen on the target surface.'
    : 'Match the product colour, sheen, and material texture as closely as possible on that surface only.';

  return [
    `Photorealistic edit of this exact ${room} photo.`,
    `Change ONLY the ${surface} to match this real supplier product finish: ${material}${productBits ? ` (${productBits})` : ''}.`,
    referenceLine,
    'Keep the same camera angle, room layout, wall positions, window and door placement, lighting, and overall geometry.',
    'Do not redesign other surfaces, invent a different floor plan, or distort the room.',
    fixtureIntegrityGuidance(params.room_type),
    'Natural materials and textures, high detail, empty room with no people, no text, no watermark.',
  ].join(' ');
}

async function resolvePhotoUrl(
  adminClient: ReturnType<typeof createClient>,
  photo: { url?: string | null; storage_path?: string | null },
): Promise<string | null> {
  if (photo.url?.startsWith('http://') || photo.url?.startsWith('https://')) {
    return photo.url;
  }
  const path = photo.storage_path || photo.url;
  if (!path) return null;

  const { data, error } = await adminClient.storage
    .from('project-photos')
    .createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) {
    const { data: publicData } = adminClient.storage.from('project-photos').getPublicUrl(path);
    return publicData?.publicUrl ?? null;
  }
  return data.signedUrl;
}

/** Remodel using OpenAI DALL-E 3 with optional GPT-4o Vision prompt refinement. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _callOpenAIRemodel(
  photoUrl: string,
  params: StyleParams,
  apiKey: string,
  productImageUrl?: string | null,
): Promise<string> {
  const basePrompt = params.prompt?.trim() || buildDesignPrompt(params);
  let finalPrompt = basePrompt;

  // Step 1: Ground prompt in uploaded photo context using GPT-4o Vision
  const roomLowerForVision = params.room_type.toLowerCase();
  const isBathroom = roomLowerForVision.includes('bath');
  const roomTypeSystemRule = isBathroom
    ? ' ROOM-SPECIFIC RULE: The room being designed is a BATHROOM. ABSOLUTELY FORBIDDEN from the prompt you write: stove, cooktop, gas burner, oven, range, range hood, kitchen sink (bathroom vanity sink is allowed), refrigerator, dishwasher, microwave, or any cooking appliance. FIXTURE LOCATIONS ARE LOCKED: The toilet and vanity must remain in their exact photographed locations; NEVER swap the toilet and vanity, never place a toilet where the vanity was, and never place a vanity where the toilet was. Your output prompt must only describe bathroom fixtures and finishes.'
    : '';
  const roomTypeFinalSuffix = isBathroom
    ? ' CRITICAL BATHROOM RULE: This render is for a BATHROOM ONLY. NEVER swap the toilet and vanity locations. Keep the vanity on its photographed wall and footprint; keep the toilet on its photographed rough-in. The generated image must NOT contain any kitchen appliances. Any such element would be a critical generation error.'
    : ' CRITICAL: All existing doors and room entryways must remain functional passage doors and doorways; do not place ovens or cabinets where a door is located. Strictly maintain the original locations of sink and stove; never swap sink and stove positions, and do not invent windows on solid walls.';

  if (photoUrl && /^https?:\/\//i.test(photoUrl)) {
    try {
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
        {
          type: 'text',
          text: `Analyze this source room photo and output a single detailed photorealistic prompt for DALL-E 3 to remodel it according to these exact specifications:\n\n${basePrompt}\n\nImportant: Output ONLY the raw prompt text for DALL-E 3 without markdown or introductory phrases.`,
        },
        {
          type: 'image_url',
          image_url: { url: photoUrl, detail: 'low' },
        },
      ];

      if (productImageUrl && /^https?:\/\//i.test(productImageUrl) && productImageUrl !== photoUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: productImageUrl, detail: 'low' },
        });
      }

      const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                `You are an elite architectural interior designer. Your task is to write a single detailed DALL-E 3 prompt to remodel this exact room into the requested style and materials while maintaining the same camera angle, room envelope, wall positions, window and door locations, and plumbing fixture count. CRITICAL ARCHITECTURAL RULES: 1. Carefully identify all doors, doorways, and windows in the source image. Every door or doorway MUST remain an unobstructed passage door or doorway. NEVER turn a door into cabinetry, and NEVER place an oven, appliance, or tall pantry where a door or doorway is located. 2. Strictly preserve the original locations of plumbing fixtures and cooking appliances. In bathrooms: keep the toilet and vanity in their exact photographed locations; NEVER swap the toilet and vanity, never place a toilet where the vanity was, and never place a vanity where the toilet was. In kitchens: keep sink and stove in their photographed locations; never swap sink and stove. Do not invent windows on solid walls.${roomTypeSystemRule}`,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
          max_tokens: 350,
        }),
      });

      if (visionRes.ok) {
        const visionJson = await visionRes.json();
        const refined = visionJson.choices?.[0]?.message?.content?.trim();
        if (refined && refined.length > 20) {
          finalPrompt = `${refined}${roomTypeFinalSuffix}`;
        }
      }
    } catch (visionErr) {
      console.warn('GPT-4o Vision prompt refinement fallback:', visionErr);
    }
  }

  // Step 2: Generate Photorealistic Remodel using OpenAI (try DALL-E 3 then DALL-E 2)
  let dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: finalPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'hd',
    }),
  });

  let bodyText = await dalleRes.text().catch(() => '');
  if (!dalleRes.ok && (bodyText.includes('does not exist') || dalleRes.status === 404 || dalleRes.status === 400)) {
    // Try DALL-E 2
    console.warn('dall-e-3 not available, attempting dall-e-2 fallback...');
    dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: finalPrompt.slice(0, 950),
        n: 1,
        size: '1024x1024',
      }),
    });
    bodyText = await dalleRes.text().catch(() => '');
  }

  if (!dalleRes.ok) {
    // Check available models for diagnostic
    try {
      const modelsRes = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const modelsJson = await modelsRes.json();
      const modelIds = (modelsJson.data || []).map((m: { id: string }) => m.id).filter((id: string) => id.includes('dall') || id.includes('image') || id.includes('tts') || id.includes('audio'));
      console.warn('Available image/audio models on OpenAI key:', modelIds);
      throw new Error(`OpenAI image generation failed: ${dalleRes.status}${bodyText ? ` · ${bodyText.slice(0, 240)}` : ''} [Available models: ${modelIds.join(', ')}]`);
    } catch {
      throw new Error(`OpenAI image generation failed: ${dalleRes.status}${bodyText ? ` · ${bodyText.slice(0, 240)}` : ''}`);
    }
  }

  let json: { data?: Array<{ url?: string }> };
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  const url = json.data?.[0]?.url;
  if (!url) throw new Error('OpenAI did not return an image URL');
  return url;
}

/**
 * True image-to-image edit using OpenAI's image edit API (gpt-image-1 / dall-e-2 edits).
 * The source photo is passed as binary — the model edits the actual room, preserving geometry.
 *
 * Fallback chain:
 *   1. gpt-image-1  /v1/images/edits  (preferred — native image edit, best quality)
 *   2. dall-e-2     /v1/images/edits  (fallback if gpt-image-1 unavailable on this key)
 *   3. DALL-E 3     /v1/images/generations (last resort — text-only, geometry not preserved)
 */
async function callOpenAIImageEdit(
  photoUrl: string,
  params: StyleParams,
  apiKey: string,
  _productImageUrl?: string | null,
): Promise<string> {
  const editPrompt = params.prompt?.trim() || buildEditPrompt(params);

  // ── Step 1: Download source photo as binary ─────────────────────────────
  let photoBytes: Uint8Array | null = null;
  let photoMime = 'image/jpeg';
  if (photoUrl && /^https?:\/\//i.test(photoUrl)) {
    try {
      const imgRes = await fetch(photoUrl);
      if (imgRes.ok) {
        photoMime = imgRes.headers.get('content-type') || 'image/jpeg';
        photoBytes = new Uint8Array(await imgRes.arrayBuffer());
      }
    } catch (dlErr) {
      console.warn('Source photo download failed, falling back to text-gen:', dlErr);
    }
  }

  // ── Step 2: Try gpt-image-1 image edit (primary) ────────────────────────
  if (photoBytes) {
    // Image edit API requires multipart/form-data
    const ext = photoMime.includes('png') ? 'png' : photoMime.includes('webp') ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', new Blob([photoBytes], { type: photoMime }), `source.${ext}`);
    form.append('prompt', editPrompt.slice(0, 32000)); // gpt-image-1 supports long prompts
    form.append('n', '1');
    form.append('size', '1024x1024');

    try {
      const editRes = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      if (editRes.ok) {
        const editJson = await editRes.json();
        // gpt-image-1 returns base64 by default — convert to data URL or extract URL
        const item = editJson.data?.[0];
        if (item?.url) return item.url;
        if (item?.b64_json) {
          // Persist as storage upload so we get a persistent URL
          const b64 = item.b64_json as string;
          const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob = new Blob([binary], { type: 'image/png' });
          // Return as data URL — persistRenderImage will upload it later
          const arr = new Uint8Array(await blob.arrayBuffer());
          let bin = '';
          arr.forEach(b => { bin += String.fromCharCode(b); });
          return `data:image/png;base64,${btoa(bin)}`;
        }
      } else {
        const errBody = await editRes.text().catch(() => '');
        console.warn(`gpt-image-1 edit failed (${editRes.status}): ${errBody.slice(0, 200)} — trying dall-e-2 edits`);
      }
    } catch (gptImgErr) {
      console.warn('gpt-image-1 edit threw:', gptImgErr, '— trying dall-e-2 edits');
    }

    // ── Step 3: Try dall-e-2 image edit (fallback) ──────────────────────────
    // dall-e-2 edits require PNG ≤ 4MB — convert if needed
    try {
      const de2Form = new FormData();
      de2Form.append('model', 'dall-e-2');
      de2Form.append('image', new Blob([photoBytes], { type: 'image/png' }), 'source.png');
      de2Form.append('prompt', editPrompt.slice(0, 950));
      de2Form.append('n', '1');
      de2Form.append('size', '1024x1024');

      const de2Res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: de2Form,
      });

      if (de2Res.ok) {
        const de2Json = await de2Res.json();
        const de2Url = de2Json.data?.[0]?.url;
        if (de2Url) {
          console.log('Used dall-e-2 image edit successfully');
          return de2Url;
        }
      } else {
        const errBody = await de2Res.text().catch(() => '');
        console.warn(`dall-e-2 edit failed (${de2Res.status}): ${errBody.slice(0, 200)} — falling back to text-gen`);
      }
    } catch (de2Err) {
      console.warn('dall-e-2 edit threw:', de2Err, '— falling back to text-gen');
    }
  }

  // Do not fall back to text-only image generation — without the source photo as a visual anchor,
  // text-to-image models hallucinate room layouts and swap toilets/vanities.
  throw new Error('Image edit provider could not process photo into remodel without altering verified layout.');
}

/** Fallback to Fal.ai if OpenAI key is not configured. */
async function callFalEdit(
  photoUrl: string,
  params: StyleParams,
  apiKey: string,
  productImageUrl?: string | null,
): Promise<string> {
  // Use edit prompt (change-focused) rather than full room description
  const prompt = params.prompt?.trim() || buildEditPrompt(params);
  const imageUrls = [photoUrl];
  if (productImageUrl && /^https?:\/\//i.test(productImageUrl) && productImageUrl !== photoUrl) {
    imageUrls.push(productImageUrl);
  }
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_urls: imageUrls,
      num_images: 1,
      output_format: 'jpeg',
      image_size: 'landscape_4_3',
      // image_strength: 0.0 = copy source exactly; 1.0 = ignore source entirely.
      // 0.35 tightly anchors room envelope, walls, and plumbing locations while applying finishes.
      image_strength: 0.35,
      guidance_scale: 7.5,
      enable_prompt_expansion: false,
      enable_safety_checker: true,
    }),
  });

  const bodyText = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Fal edit failed: ${res.status}${bodyText ? ` · ${bodyText.slice(0, 240)}` : ''}`);
  }

  let json: {
    images?: Array<{ url?: string }>;
    image?: { url?: string };
    data?: { images?: Array<{ url?: string }> };
  };
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error('Fal edit returned invalid JSON');
  }

  const url =
    json.images?.[0]?.url ??
    json.data?.images?.[0]?.url ??
    json.image?.url ??
    null;
  if (!url) throw new Error('Fal edit did not return an image URL');
  return url;
}

async function persistRenderImage(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
  remoteUrl: string,
  suffix: string,
): Promise<string> {
  let bytes: Uint8Array;
  let contentType: string;

  if (remoteUrl.startsWith('data:')) {
    // gpt-image-1 returns base64 data URLs — decode directly
    const [header, b64] = remoteUrl.split(',');
    contentType = header.replace('data:', '').replace(';base64', '') || 'image/png';
    try {
      bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    } catch {
      console.warn('Failed to decode base64 render data URL');
      return remoteUrl;
    }
  } else {
    const imgRes = await fetch(remoteUrl);
    if (!imgRes.ok) return remoteUrl;
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    bytes = new Uint8Array(await imgRes.arrayBuffer());
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `${projectId}/renders/${Date.now()}-${suffix}.${ext}`;

  const { error: uploadError } = await adminClient.storage
    .from('project-photos')
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) {
    console.warn('Render upload failed, using remote URL:', uploadError.message);
    return remoteUrl;
  }

  const { data: publicData } = adminClient.storage.from('project-photos').getPublicUrl(path);
  return publicData?.publicUrl || remoteUrl;
}

/**
 * Post-generation safety check: uses GPT-4o Vision to confirm the generated render
 * matches the homeowner's approved renovation change set — NOT just the original room.
 *
 * Validates:
 *   1. Forbidden cross-room items are absent (e.g. no stove in bathroom)
 *   2. Approved REMOVALS are absent (e.g. no tub if user selected walk-in shower)
 *   3. Approved ADDITIONS are present — WARN only (camera angle may hide them)
 *
 * Returns { valid: true } if acceptable, or { valid: false, reason } to trigger retry.
 */
async function validateRenderForRoomType(
  imageUrl: string,
  expectedRoomState: ExpectedRoomState,
  openaiKey: string,
  sourcePhotoUrl?: string | null,
): Promise<{ valid: boolean; reason?: string; warnings?: string[] }> {
  const roomLabel = expectedRoomState.room_type.replace(/_/g, ' ');
  const isBathroomCheck = expectedRoomState.room_type.toLowerCase().includes('bath');

  // ── Build check list ───────────────────────────────────────────────────────
  const hardChecks: string[] = [];
  const softChecks: string[] = [];

  if (expectedRoomState.forbidden_cross_room_items.length > 0) {
    hardChecks.push(
      `Cross-room check: The following items must NOT appear in this render: ${expectedRoomState.forbidden_cross_room_items.join(', ')}. If ANY are visible — even partially — report as invalid.`
    );
  }

  const removals = expectedRoomState.fixtures.filter(f => f.state === 'remove');
  for (const r of removals) {
    hardChecks.push(
      `Removal check: "${r.name}" must NOT appear in this render${r.notes ? ` (${r.notes})` : ''}. If visible, report as invalid.`
    );
  }

  const additions = expectedRoomState.fixtures.filter(f => f.state === 'add');
  for (const a of additions) {
    softChecks.push(
      `Addition check: "${a.name}" should be clearly visible${a.notes ? ` (${a.notes})` : ''}.`
    );
  }

  // ── Bathroom geometry hard checks ──────────────────────────────────────────
  if (isBathroomCheck) {
    // Vanity count check: detect double vanity on opposite walls (common AI hallucination)
    const doubleVanityApproved = expectedRoomState.fixtures.some(
      f => f.name === 'vanity' && f.notes?.toLowerCase().includes('2 sinks')
    );
    if (!doubleVanityApproved) {
      hardChecks.push(
        'Vanity count check: There must be exactly ONE vanity unit with ONE sink. If two separate vanities are visible on opposite walls or in different locations, report as invalid.'
      );
    }

    // Fixture location swap check: toilet and vanity must never switch places
    hardChecks.push(
      'Fixture location swap check: Compare with the source photo. The toilet and vanity must remain in their original photographed locations. If toilet and vanity positions appear swapped, transposed, or switched, report as invalid.'
    );

    // Window count check: small bathrooms typically have zero windows.
    // The AI frequently invents windows that don't exist in the source photo.
    hardChecks.push(
      'Window invention check: Compare the number of windows visible in this render against what is typical for a small bathroom renovation from a source photo. If two or more windows are visible and the room appears to be a small bathroom (under 50 sq ft), report as invalid — windows are likely invented.'
    );
  }

  // Always skip API if still no checks
  if (hardChecks.length === 0 && softChecks.length === 0) {
    return { valid: true };
  }

  const checkList = [
    ...hardChecks.map((c, i) => `HARD CHECK ${i + 1}: ${c}`),
    ...softChecks.map((c, i) => `SOFT CHECK ${i + 1} (warn only, do not fail): ${c}`),
  ].join('\n');

  // ── Bathroom-specific binary questions (reduces ambiguity for small objects) ──
  const bathroomBinaryQ = isBathroomCheck
    ? '\n\nCRITICAL BINARY CHECKS (answer in reason field if YES):\n1. Is there a gas burner, electric cooktop, stove, or oven visible anywhere? YES_APPLIANCE_FOUND or NO_APPLIANCE_FOUND.\n2. Are there TWO or more separate vanity units/sinks visible in different locations in the room? YES_DOUBLE_VANITY or NO_DOUBLE_VANITY.\n3. Are there TWO or more windows visible? YES_MULTI_WINDOW or NO_MULTI_WINDOW.\n4. Have the toilet and vanity swapped places, or has the toilet moved into the vanity area or vice versa compared to the source room photo? YES_SWAPPED_FIXTURES or NO_SWAPPED_FIXTURES.\nInclude these answers in the reason field only if they are YES.'
    : '';

  const promptText = [
    `This image is an AI-generated render of a ${roomLabel} renovation.`,
    `Inspect it carefully against the approved change set${sourcePhotoUrl ? ' and compare it to the source room photo' : ''}:\n\n${checkList}${bathroomBinaryQ}`,
    `\nRespond with ONLY a raw JSON object (no markdown, no code fences):`,
    `{"valid": true} if all HARD CHECKs pass,`,
    `or {"valid": false, "reason": "<specific hard check that failed>"} if any HARD CHECK fails.`,
    `Optionally include "warnings" array for soft-check concerns.`,
  ].join(' ');

  try {
    const userMessageContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
    > = [];

    if (sourcePhotoUrl && /^https?:\/\//i.test(sourcePhotoUrl)) {
      userMessageContent.push(
        { type: 'text', text: 'SOURCE ROOM PHOTO (Ground truth reference of the actual room before renovation):' },
        { type: 'image_url', image_url: { url: sourcePhotoUrl, detail: 'high' } },
        { type: 'text', text: `AI-GENERATED RENOVATION RENDER TO INSPECT:\n${promptText}` },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
      );
    } else {
      userMessageContent.push(
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
      );
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a strict construction quality inspector reviewing AI-generated renovation renders. You must respond with ONLY a raw JSON object — no markdown, no code fences, no backticks, no explanation. Just the JSON.',
          },
          {
            role: 'user',
            content: userMessageContent,
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      console.warn(`Render validation API failed (${res.status}) — fail-open`);
      return { valid: true };
    }

    const json = await res.json();
    const rawContent = json.choices?.[0]?.message?.content?.trim() ?? '';

    // Bug C fix 1: Always log raw content for debugging
    console.log(`Render validation raw response for ${roomLabel}:`, rawContent);

    // Bug C fix 2: Strip markdown code fences before parsing
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Bug C fix 3: Keyword fallback — if GPT mentioned an appliance, swapped fixtures, or said false,
    // treat as invalid even if JSON parsing fails
    const lowerRaw = rawContent.toLowerCase();
    const keywordHit = isBathroomCheck && (
      lowerRaw.includes('yes_appliance_found') ||
      lowerRaw.includes('yes_double_vanity') ||
      lowerRaw.includes('yes_multi_window') ||
      lowerRaw.includes('yes_swapped_fixtures') ||
      (lowerRaw.includes('"valid": false') || lowerRaw.includes('"valid":false')) ||
      (lowerRaw.includes('stove') && !lowerRaw.includes('no stove')) ||
      (lowerRaw.includes('cooktop') && !lowerRaw.includes('no cooktop')) ||
      (lowerRaw.includes('gas burner') && !lowerRaw.includes('no gas')) ||
      (lowerRaw.includes('oven') && !lowerRaw.includes('no oven') && !lowerRaw.includes('bathroom')) ||
      (lowerRaw.includes('two vanit') || lowerRaw.includes('double vanit') || lowerRaw.includes('two sink') || lowerRaw.includes('two separate vanit')) ||
      (lowerRaw.includes('swapped') && !lowerRaw.includes('not swapped')) ||
      lowerRaw.includes('swapped places') ||
      lowerRaw.includes('toilet and vanity switched') ||
      lowerRaw.includes('vanity and toilet switched')
    );

    try {
      const parsed = JSON.parse(cleaned) as { valid: boolean; reason?: string; warnings?: string[] };
      if (parsed.warnings?.length) {
        console.warn(`Render validation warnings (non-blocking) for ${roomLabel}:`, parsed.warnings.join('; '));
      }
      // If parsed says valid but keyword hit fired, override
      if (parsed.valid && keywordHit) {
        console.warn(`Render validation: parsed valid=true but keyword hit detected — overriding to invalid`);
        const reason = lowerRaw.includes('swapped') || lowerRaw.includes('yes_swapped_fixtures')
          ? 'Keyword fallback: toilet and vanity swapped places in bathroom render'
          : 'Keyword fallback: appliance or layout drift detected in bathroom render';
        return { valid: false, reason };
      }
      return parsed;
    } catch (parseErr) {
      console.warn(`Render validation JSON parse failed (raw: "${rawContent}"):`, parseErr);
      // Bug C fix 4: Use keyword fallback if JSON parse fails
      if (keywordHit) {
        const reason = lowerRaw.includes('swapped') || lowerRaw.includes('yes_swapped_fixtures')
          ? 'Keyword fallback after JSON parse failure: toilet and vanity swapped places'
          : 'Keyword fallback after JSON parse failure: appliance or layout drift detected in bathroom render';
        return { valid: false, reason };
      }
      return { valid: true }; // Fail open only when no keyword hit
    }
  } catch (err) {
    console.warn('Render validation check failed (fail-open):', err);
    return { valid: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const project_id = body.project_id;
    const force = body.force === true;
    const style_override =
      typeof body.style_override === 'string' && body.style_override.trim()
        ? body.style_override.trim().toLowerCase()
        : null;
    const surface_edit = body.surface_edit && typeof body.surface_edit === 'object'
      ? {
          surface_label: typeof body.surface_edit.surface_label === 'string'
            ? body.surface_edit.surface_label.trim()
            : '',
          material: typeof body.surface_edit.material === 'string'
            ? body.surface_edit.material.trim()
            : '',
          color_name: typeof body.surface_edit.color_name === 'string'
            ? body.surface_edit.color_name.trim()
            : null,
          brand: typeof body.surface_edit.brand === 'string'
            ? body.surface_edit.brand.trim()
            : null,
          sku: typeof body.surface_edit.sku === 'string'
            ? body.surface_edit.sku.trim()
            : null,
          image_url: typeof body.surface_edit.image_url === 'string'
            ? body.surface_edit.image_url.trim()
            : null,
        }
      : null;
    let questionnaire_answers = body.questionnaire_answers as Record<string, unknown> | null | undefined;

    if (!project_id || typeof project_id !== 'string') {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, room_type, homeowner_id, questionnaire_answers')
      .eq('id', project_id)
      .single();

    if (projectError || !project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!questionnaire_answers || typeof questionnaire_answers !== 'object') {
      questionnaire_answers = (project.questionnaire_answers as Record<string, unknown>) ?? {};
    }

    const measurementsData = (body.measurements && typeof body.measurements === 'object')
      ? body.measurements
      : null;
    const surfacesData = body.surface_selections ?? null;
    const dimensionsSummary = formatDimensionsSummary(measurementsData);
    const surfaceSelectionsSummary = formatSurfaceSelectionsSummary(surfacesData);

    // Build the expected final room state from the homeowner's approved answers.
    // This drives both the AI prompt and the post-generation validator.
    const roomType = String(project.room_type || 'kitchen').toLowerCase();
    const expectedRoomState = buildExpectedRoomState(roomType, questionnaire_answers);
    console.log(`Expected room state for ${roomType}:`, JSON.stringify(expectedRoomState.fixtures.map(f => ({ name: f.name, state: f.state }))));

    const { data: existingRenders, error: existingRendersError } = await adminClient
      .from('renders')
      .select('id, url, style_params, selected')
      .eq('project_id', project_id)
      .order('created_at', { ascending: true });
    if (existingRendersError) throw existingRendersError;

    // Bug A fix: validate cached renders before serving. If the selected (or first) cached
    // render fails validation, delete all renders for this project and fall through to regeneration.
    // This catches renders that were generated before the validator existed or with swapped fixtures.
    if (!force && !surface_edit && existingRenders && existingRenders.length > 0) {
      const openaiKeyForValidation = Deno.env.get('OPENAI_API_KEY');
      let cacheIsClean = true;

      const isBathroom = expectedRoomState.room_type.toLowerCase().includes('bath');
      // Run validation if there are forbidden items, removals, or if it's a bathroom (to catch swapped fixtures / appliances)
      const hasMeaningfulChecks =
        expectedRoomState.forbidden_cross_room_items.length > 0 ||
        expectedRoomState.fixtures.some(f => f.state === 'remove') ||
        isBathroom;

      if (openaiKeyForValidation && hasMeaningfulChecks) {
        // Validate the selected render, or fall back to the first one
        const renderToCheck =
          existingRenders.find(r => r.selected) ?? existingRenders[0];
        if (renderToCheck?.url) {
          try {
            const { data: firstPhoto } = await adminClient
              .from('project_photos')
              .select('url, storage_path')
              .eq('project_id', project_id)
              .order('uploaded_at', { ascending: true })
              .limit(1)
              .single();
            const sourcePhotoForCache = firstPhoto ? await resolvePhotoUrl(adminClient, firstPhoto) : null;
            const cacheValidation = await validateRenderForRoomType(
              renderToCheck.url,
              expectedRoomState,
              openaiKeyForValidation,
              sourcePhotoForCache,
            );
            if (!cacheValidation.valid) {
              console.warn(
                `Cached render FAILED validation: ${cacheValidation.reason}. Deleting ${existingRenders.length} render(s) and regenerating.`,
              );
              cacheIsClean = false;
              // Delete all bad renders for this project so they won't be served again
              await adminClient
                .from('renders')
                .delete()
                .eq('project_id', project_id);
            }
          } catch (validationErr) {
            console.warn('Cache validation threw — serving cache as-is:', validationErr);
            cacheIsClean = true; // Fail open
          }
        }
      }

      if (cacheIsClean) {
        return new Response(
          JSON.stringify({ success: true, renders: existingRenders, fallback: false, cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // cacheIsClean=false: fall through to regeneration below
    }


    const { data: photos, error: photosError } = await adminClient
      .from('project_photos')
      .select('url, storage_path')
      .eq('project_id', project_id)
      .order('uploaded_at', { ascending: true })
      .limit(3);
    if (photosError) throw photosError;

    if (!photos || photos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          renders: existingRenders ?? [],
          fallback: true,
          reason: 'No project photos found for AI redesign',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const selectedExisting = (existingRenders ?? []).find((r: { selected?: boolean | null }) => r.selected)
      ?? (existingRenders ?? [])[0]
      ?? null;
    const baseImageUrl = surface_edit && selectedExisting?.url
      ? selectedExisting.url
      : await resolvePhotoUrl(adminClient, photos[0]);
    if (!baseImageUrl) {
      return new Response(
        JSON.stringify({
          success: true,
          renders: existingRenders ?? [],
          fallback: true,
          reason: 'Project photo URL could not be resolved',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Prioritize Fal.ai for true image-to-image remodeling (preserves exact room geometry & plumbing locations).
    // OpenAI is used for prompt vision refinement, safety validation, and fallback image editing.
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const falKey = Deno.env.get('FAL_KEY') || Deno.env.get('FAL_API_KEY');
    const provider: 'fal' | 'openai' = falKey ? 'fal' : (openaiKey ? 'openai' : 'fal');
    const activeApiKey = falKey || openaiKey;

    if (!activeApiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          renders: existingRenders ?? [],
          fallback: true,
          reason: 'No image-based render provider is configured',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const selectedStyle = style_override || extractDesignStyle(questionnaire_answers);
    const selectedTier = extractMaterialTier(questionnaire_answers);
    const qualityTierMap: Record<string, string> = {
      budget: 'budget',
      'mid-range': 'standard',
      luxury: 'luxury',
    };

    const altStyles = ['modern', 'contemporary', 'spa', 'traditional', 'transitional', 'farmhouse', 'industrial']
      .filter((style) => style !== selectedStyle)
      .slice(0, 3);

    const recommended: StyleParams = {
      design_style: selectedStyle,
      material_tier: qualityTierMap[selectedTier] ?? 'standard',
      room_type: roomType,
      provider,
      dimensions_summary: dimensionsSummary,
      surface_selections_summary: surfaceSelectionsSummary,
      expected_room_state: expectedRoomState,
    };

    const surfaceConfig: StyleParams | null = surface_edit && surface_edit.surface_label && surface_edit.material
      ? {
          design_style: `${surface_edit.surface_label.toLowerCase().replace(/\s+/g, '-')}-edit`,
          material_tier: recommended.material_tier,
          room_type: roomType,
          provider,
          prompt: buildSurfaceEditPrompt({
            room_type: roomType,
            surface_label: surface_edit.surface_label,
            material: surface_edit.material,
            color_name: surface_edit.color_name,
            brand: surface_edit.brand,
            sku: surface_edit.sku,
            has_product_image: Boolean(surface_edit.image_url),
          }),
        }
      : null;

    // Surface edit / force style chip / force scrap: append one. Initial: recommended + alts.
    const renderConfigs: StyleParams[] = surfaceConfig
      ? [surfaceConfig]
      : force && style_override
        ? [recommended]
        : force
          ? [
              {
                ...recommended,
                design_style: `${recommended.design_style}-refresh`,
                // Bug D fix: use geometry-locked Refresh Mode prompt instead of buildDesignPrompt
                prompt: buildRefreshModePrompt({
                  ...recommended,
                  design_style: recommended.design_style,
                }),
              },
            ]
          : [
              recommended,
              ...altStyles.slice(0, 1).map((design_style) => ({
                design_style,
                material_tier: 'standard',
                room_type: roomType,
                provider,
                expected_room_state: expectedRoomState,
              })),
            ];

    const newlySaved: Array<{ id: string; url: string; style_params: StyleParams; selected?: boolean }> = [];
    const errors: string[] = [];
    const primaryPhotoUrl = baseImageUrl;

    const generateOneConfig = async (config: StyleParams, index: number) => {
      let activeConfig = { ...config };
      let remoteUrl: string | null = null;
      let validationPassed = true;
      const isSurfaceEdit = !!surfaceConfig && config === surfaceConfig;
      const maxAttempts = isSurfaceEdit ? 1 : 2;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          if (falKey) {
            try {
              remoteUrl = await callFalEdit(
                primaryPhotoUrl,
                activeConfig,
                falKey,
                isSurfaceEdit ? surface_edit?.image_url : null,
              );
            } catch (falErr) {
              const falMsg = falErr instanceof Error ? falErr.message : String(falErr);
              console.warn('Fal image edit failed, attempting OpenAI fallback:', falMsg);
              if (openaiKey) {
                remoteUrl = await callOpenAIImageEdit(
                  primaryPhotoUrl,
                  activeConfig,
                  openaiKey,
                  isSurfaceEdit ? surface_edit?.image_url : null,
                );
              } else {
                throw falErr;
              }
            }
          } else if (openaiKey) {
            remoteUrl = await callOpenAIImageEdit(
              primaryPhotoUrl,
              activeConfig,
              openaiKey,
              isSurfaceEdit ? surface_edit?.image_url : null,
            );
          }

          // Post-generation validation on full renders
          if (remoteUrl && openaiKey && activeConfig.expected_room_state && !isSurfaceEdit) {
            const validation = await validateRenderForRoomType(
              remoteUrl,
              activeConfig.expected_room_state,
              openaiKey,
              primaryPhotoUrl,
            );
            if (!validation.valid) {
              console.warn(`Render validation FAILED (attempt ${attempt + 1}): ${validation.reason}. Retrying generation.`);
              if (attempt < maxAttempts - 1) {
                remoteUrl = null;
                const isSwap = (validation.reason || '').toLowerCase().includes('swap');
                const correction = isSwap
                  ? 'CRITICAL RETRY CORRECTION: The previous generation swapped the toilet and vanity. YOU MUST KEEP the vanity on the exact original wall and keep the toilet in its original position. NEVER swap them.'
                  : `CRITICAL RETRY CORRECTION: ${validation.reason}. Strictly preserve the original layout and fixture locations.`;
                activeConfig = {
                  ...activeConfig,
                  prompt: activeConfig.prompt
                    ? `${correction} ${activeConfig.prompt}`
                    : `${correction} ${buildEditPrompt(activeConfig)}`,
                };
                continue;
              }
              validationPassed = false;
            }
          }
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`Render generation attempt ${attempt + 1} failed:`, msg);
          errors.push(msg);
        }
      }

      if (!remoteUrl) return null;

      const persistedUrl = await persistRenderImage(
        adminClient,
        project_id,
        remoteUrl,
        `${config.design_style}-${index}`,
      );

      return { config: activeConfig, persistedUrl, index, validationPassed };
    };

    const results = await Promise.all(renderConfigs.map((cfg, idx) => generateOneConfig(cfg, idx)));

    for (const res of results) {
      if (!res) continue;
      const makeSelected = newlySaved.length === 0 && (
        !existingRenders
        || existingRenders.length === 0
        || force
        || !!surfaceConfig
      );

      if (makeSelected && existingRenders && existingRenders.length > 0) {
        await adminClient.from('renders').update({ selected: false }).eq('project_id', project_id);
      }

      const { data: saved, error: saveError } = await adminClient
        .from('renders')
        .insert({
          project_id,
          url: res.persistedUrl,
          style_params: { ...res.config, prompt: res.config.prompt || buildDesignPrompt(res.config) },
          selected: makeSelected,
        })
        .select('id, url, style_params, selected')
        .single();

      if (saveError) {
        console.warn(`Failed to save render: ${saveError.message}`);
        errors.push(saveError.message);
        continue;
      }
      if (saved) newlySaved.push(saved as typeof newlySaved[number]);
    }

    if (newlySaved.length > 0 && newlySaved[0].selected) {
      await adminClient
        .from('projects')
        .update({ selected_render_id: newlySaved[0].id })
        .eq('id', project_id);
    }

    const { data: allRenders, error: allRendersError } = await adminClient
      .from('renders')
      .select('id, url, style_params, selected')
      .eq('project_id', project_id)
      .order('created_at', { ascending: true });
    if (allRendersError) throw allRendersError;

    const gallery = (allRenders ?? []) as typeof newlySaved;
    const fallback = gallery.length === 0;

    return new Response(
      JSON.stringify({
        success: true,
        renders: gallery,
        fallback,
        reason: fallback
          ? errors[0] || 'Image-based render provider did not return a preview'
          : undefined,
        provider,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-render error:', err);
    return new Response(
      JSON.stringify({
        success: true,
        renders: [],
        fallback: true,
        reason: err instanceof Error ? err.message : String(err),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
