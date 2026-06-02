/**
 * Walker AI – Pricing Reference Data
 * Ontario/GTA market averages. Source: internal Walker AI pricing library.
 * All prices in CAD.
 */

// ─── Labor Pricing Library ────────────────────────────────────────────────────

export const LABOR_PRICING = {
  demolition: {
    full_bathroom_demo:      { unit: 'EA',  low: 900,   avg: 1200,  high: 1500  },
    tile_demolition:         { unit: 'SQF', low: 4,     avg: 6,     high: 8     },
    drywall_demolition:      { unit: 'SQF', low: 2,     avg: 3,     high: 4     },
    tub_removal:             { unit: 'EA',  low: 150,   avg: 225,   high: 300   },
    vanity_removal:          { unit: 'EA',  low: 75,    avg: 110,   high: 150   },
    toilet_removal:          { unit: 'EA',  low: 50,    avg: 75,    high: 100   },
    kitchen_cabinet_removal: { unit: 'LF',  low: 15,    avg: 20,    high: 30    },
    floor_removal:           { unit: 'SQF', low: 3,     avg: 5,     high: 7     },
    ceiling_drywall_removal: { unit: 'SQF', low: 2,     avg: 3,     high: 4     },
    partition_wall_demo:     { unit: 'LF',  low: 15,    avg: 25,    high: 40    },
  },
  plumbing: {
    toilet_install:          { unit: 'EA',  low: 250,   avg: 350,   high: 450   },
    vanity_install:          { unit: 'EA',  low: 350,   avg: 500,   high: 650   },
    shower_valve_install:    { unit: 'EA',  low: 300,   avg: 450,   high: 600   },
    drain_install:           { unit: 'EA',  low: 400,   avg: 600,   high: 800   },
    water_supply_line:       { unit: 'LF',  low: 25,    avg: 32,    high: 40    },
    minor_plumbing_reloc:    { unit: 'EA',  low: 700,   avg: 950,   high: 1200  },
    drain_reloc_wood_floor:  { unit: 'EA',  low: 1500,  avg: 1800,  high: 2500  },
    drain_reloc_slab:        { unit: 'EA',  low: 3000,  avg: 3500,  high: 6500  },
    tub_install:             { unit: 'EA',  low: 400,   avg: 650,   high: 900   },
    shower_base_install:     { unit: 'EA',  low: 300,   avg: 500,   high: 750   },
  },
  electrical: {
    gfi_outlet_install:      { unit: 'EA',  low: 120,   avg: 150,   high: 180   },
    standard_outlet_install: { unit: 'EA',  low: 80,    avg: 100,   high: 120   },
    light_fixture_install:   { unit: 'EA',  low: 120,   avg: 180,   high: 250   },
    pot_light_install:       { unit: 'EA',  low: 120,   avg: 160,   high: 220   },
    new_circuit_install:     { unit: 'EA',  low: 350,   avg: 550,   high: 800   },
    panel_upgrade:           { unit: 'EA',  low: 2000,  avg: 2800,  high: 4500  },
    bathroom_fan_install:    { unit: 'EA',  low: 250,   avg: 400,   high: 600   },
    under_cabinet_lighting:  { unit: 'LF',  low: 30,    avg: 45,    high: 65    },
    switch_install:          { unit: 'EA',  low: 80,    avg: 110,   high: 140   },
    smart_switch_install:    { unit: 'EA',  low: 120,   avg: 180,   high: 250   },
  },
  tile: {
    floor_tile_install:      { unit: 'SQF', low: 10,    avg: 14,    high: 18    },
    wall_tile_install:       { unit: 'SQF', low: 12,    avg: 18,    high: 22    },
    shower_tile_install:     { unit: 'SQF', low: 15,    avg: 22,    high: 28    },
    backsplash_tile_install: { unit: 'SQF', low: 12,    avg: 18,    high: 24    },
    large_format_tile:       { unit: 'SQF', low: 16,    avg: 22,    high: 30    },
    tile_grout:              { unit: 'SQF', low: 3,     avg: 4,     high: 6     },
    tile_leveling_system:    { unit: 'SQF', low: 2,     avg: 3,     high: 5     },
    heated_floor_tile:       { unit: 'SQF', low: 18,    avg: 24,    high: 32    },
    tile_waterproof_prep:    { unit: 'SQF', low: 6,     avg: 8,     high: 12    },
  },
  framing: {
    wall_framing:            { unit: 'LF',  low: 90,    avg: 110,   high: 140   },
    bulkhead_framing:        { unit: 'LF',  low: 70,    avg: 90,    high: 110   },
    door_framing:            { unit: 'EA',  low: 200,   avg: 300,   high: 400   },
    window_framing:          { unit: 'EA',  low: 200,   avg: 350,   high: 500   },
    closet_framing:          { unit: 'EA',  low: 150,   avg: 250,   high: 350   },
    soffit_framing:          { unit: 'LF',  low: 60,    avg: 80,    high: 110   },
    partition_wall_framing:  { unit: 'LF',  low: 80,    avg: 100,   high: 130   },
    niche_framing:           { unit: 'EA',  low: 120,   avg: 180,   high: 250   },
    ceiling_drop_framing:    { unit: 'SQF', low: 6,     avg: 9,     high: 14    },
    structural_header:       { unit: 'EA',  low: 400,   avg: 700,   high: 1200  },
  },
  drywall: {
    drywall_install:         { unit: 'SQF', low: 3,     avg: 5,     high: 6     },
    drywall_finishing:       { unit: 'SQF', low: 2,     avg: 3,     high: 4     },
    moisture_resistant_dw:   { unit: 'SQF', low: 4,     avg: 6,     high: 8     },
    ceiling_drywall_install: { unit: 'SQF', low: 3,     avg: 5,     high: 7     },
    corner_bead_install:     { unit: 'LF',  low: 3,     avg: 4,     high: 6     },
    drywall_patch_repair:    { unit: 'EA',  low: 100,   avg: 180,   high: 300   },
    level5_finish:           { unit: 'SQF', low: 5,     avg: 7,     high: 9     },
    soundproof_drywall:      { unit: 'SQF', low: 6,     avg: 9,     high: 12    },
  },
  waterproofing: {
    shower_waterproof_membrane: { unit: 'SQF', low: 8,  avg: 11,    high: 14    },
    floor_waterproofing:        { unit: 'SQF', low: 6,  avg: 9,     high: 12    },
    shower_pan_waterproofing:   { unit: 'EA',  low: 250, avg: 400,  high: 600   },
    bathroom_floor_membrane:    { unit: 'SQF', low: 6,  avg: 9,     high: 12    },
  },
  flooring: {
    laminate_install:        { unit: 'SQF', low: 5,     avg: 7,     high: 9     },
    engineered_hardwood:     { unit: 'SQF', low: 7,     avg: 10,    high: 14    },
    vinyl_plank_install:     { unit: 'SQF', low: 4,     avg: 6,     high: 8     },
    subfloor_repair:         { unit: 'SQF', low: 6,     avg: 9,     high: 15    },
    self_leveling_compound:  { unit: 'SQF', low: 5,     avg: 9,     high: 15    },
    heated_floor_system:     { unit: 'SQF', low: 12,    avg: 18,    high: 25    },
  },
  cabinetry: {
    kitchen_cabinet_install: { unit: 'LF',  low: 180,   avg: 250,   high: 350   },
    vanity_cabinet_install:  { unit: 'EA',  low: 200,   avg: 350,   high: 500   },
    cabinet_hardware:        { unit: 'EA',  low: 8,     avg: 12,    high: 20    },
    custom_cabinet_install:  { unit: 'LF',  low: 250,   avg: 350,   high: 500   },
    pantry_cabinet_install:  { unit: 'EA',  low: 350,   avg: 600,   high: 900   },
  },
  painting: {
    interior_wall_painting:  { unit: 'SQF', low: 1.5,   avg: 2.25,  high: 3     },
    ceiling_painting:        { unit: 'SQF', low: 1.5,   avg: 2,     high: 2.75  },
    trim_painting:           { unit: 'LF',  low: 2,     avg: 3,     high: 4     },
    door_painting:           { unit: 'EA',  low: 60,    avg: 90,    high: 140   },
    cabinet_painting:        { unit: 'LF',  low: 20,    avg: 30,    high: 45    },
  },
  carpentry: {
    baseboard_install:       { unit: 'LF',  low: 6,     avg: 9,     high: 14    },
    door_install:            { unit: 'EA',  low: 250,   avg: 400,   high: 650   },
    interior_trim_install:   { unit: 'LF',  low: 6,     avg: 10,    high: 16    },
    casing_install:          { unit: 'LF',  low: 7,     avg: 10,    high: 15    },
    custom_shelving:         { unit: 'EA',  low: 120,   avg: 200,   high: 350   },
  },
  risk_allowance: {
    moisture_damage_repair:  { unit: 'EA',  low: 800,   avg: 2000,  high: 5000  },
    floor_leveling:          { unit: 'SQF', low: 5,     avg: 9,     high: 15    },
    hidden_plumbing_repair:  { unit: 'EA',  low: 600,   avg: 1200,  high: 3000  },
    mold_remediation:        { unit: 'EA',  low: 1500,  avg: 2500,  high: 6000  },
    structural_reinforcement:{ unit: 'EA',  low: 1000,  avg: 2500,  high: 7000  },
  },
  permit: {
    permit_allowance:        { unit: 'EA',  low: 800,   avg: 1000,  high: 2500  },
  },
};

// ─── Material Cost Library ────────────────────────────────────────────────────

export const MATERIAL_PRICING = {
  tile_surface: {
    floor_tile:              { unit: 'SQF',     low: 4,    avg: 7,    high: 12   },
    wall_tile:               { unit: 'SQF',     low: 5,    avg: 8,    high: 15   },
    shower_tile:             { unit: 'SQF',     low: 6,    avg: 10,   high: 18   },
    backsplash_tile:         { unit: 'SQF',     low: 5,    avg: 9,    high: 16   },
    grout:                   { unit: 'Bag Eq.', low: 18,   avg: 28,   high: 45   },
    thinset_mortar:          { unit: 'Bag Eq.', low: 22,   avg: 35,   high: 55   },
    tile_edging_trim:        { unit: 'LF',      low: 3,    avg: 5,    high: 8    },
    tile_leveling_clips:     { unit: 'Box',     low: 12,   avg: 22,   high: 38   },
    tile_spacers:            { unit: 'Box',     low: 6,    avg: 10,   high: 18   },
    silicone_sealant:        { unit: 'Tube',    low: 10,   avg: 16,   high: 28   },
    interior_caulking:       { unit: 'Tube',    low: 8,    avg: 12,   high: 20   },
  },
  waterproofing: {
    waterproof_membrane:     { unit: 'SQF',     low: 2,    avg: 3.5,  high: 5.5  },
    liquid_waterproofing:    { unit: 'SQF',     low: 1.5,  avg: 2.5,  high: 4.0  },
    shower_pan_kit:          { unit: 'EA',      low: 180,  avg: 280,  high: 450  },
    shower_niche_kit:        { unit: 'EA',      low: 45,   avg: 75,   high: 140  },
    waterproof_tape_corners: { unit: 'EA',      low: 20,   avg: 35,   high: 60   },
  },
  drywall: {
    drywall_board:           { unit: 'Sheet',   low: 16,   avg: 22,   high: 35   },
    moisture_resist_dw:      { unit: 'Sheet',   low: 20,   avg: 28,   high: 40   },
    cement_board:            { unit: 'Sheet',   low: 18,   avg: 25,   high: 38   },
    joint_compound:          { unit: 'Bag',     low: 18,   avg: 25,   high: 40   },
    drywall_screws:          { unit: 'Box',     low: 15,   avg: 25,   high: 40   },
  },
  insulation: {
    batt_insulation:         { unit: 'SQF',     low: 1.2,  avg: 2.0,  high: 3.4  },
    rigid_foam:              { unit: 'SQF',     low: 1.8,  avg: 2.8,  high: 4.5  },
    acoustic_insulation:     { unit: 'SQF',     low: 1.5,  avg: 2.4,  high: 3.8  },
  },
  framing: {
    lumber_2x4:              { unit: 'LF',      low: 1.8,  avg: 2.8,  high: 4.5  },
    lumber_2x6:              { unit: 'LF',      low: 2.6,  avg: 3.8,  high: 6.0  },
    pressure_treated_lumber: { unit: 'LF',      low: 3.2,  avg: 4.8,  high: 7.5  },
    plywood_sheathing:       { unit: 'Sheet',   low: 28,   avg: 42,   high: 65   },
    osb:                     { unit: 'Sheet',   low: 22,   avg: 34,   high: 52   },
  },
  flooring: {
    laminate:                { unit: 'SQF',     low: 2.0,  avg: 3.5,  high: 6.0  },
    vinyl_plank:             { unit: 'SQF',     low: 2.5,  avg: 4.25, high: 7.0  },
    engineered_hardwood:     { unit: 'SQF',     low: 4.5,  avg: 7.5,  high: 12.0 },
    tile_underlayment:       { unit: 'SQF',     low: 1.0,  avg: 1.8,  high: 3.0  },
    flooring_underpad:       { unit: 'SQF',     low: 0.5,  avg: 0.9,  high: 1.6  },
    heated_floor_mat:        { unit: 'SQF',     low: 7.0,  avg: 11.0, high: 18.0 },
  },
  paint: {
    interior_wall_paint:     { unit: 'Gallon',  low: 25,   avg: 40,   high: 70   },
    ceiling_paint:           { unit: 'Gallon',  low: 22,   avg: 36,   high: 60   },
    primer:                  { unit: 'Gallon',  low: 18,   avg: 28,   high: 45   },
    trim_cabinet_paint:      { unit: 'EA',      low: 20,   avg: 35,   high: 60   },
  },
  plumbing_fixtures: {
    toilet:                  { unit: 'EA',      low: 250,  avg: 425,  high: 700  },
    vanity:                  { unit: 'EA',      low: 400,  avg: 850,  high: 1500 },
    sink_basin:              { unit: 'EA',      low: 120,  avg: 240,  high: 500  },
    sink_faucet:             { unit: 'EA',      low: 90,   avg: 180,  high: 350  },
    shower_valve_trim:       { unit: 'EA',      low: 150,  avg: 300,  high: 650  },
    shower_head_kit:         { unit: 'EA',      low: 80,   avg: 180,  high: 300  },
    tub_filler_faucet:       { unit: 'EA',      low: 140,  avg: 320,  high: 700  },
    bathtub:                 { unit: 'EA',      low: 500,  avg: 1100, high: 2200 },
    shower_base_pan:         { unit: 'EA',      low: 180,  avg: 350,  high: 750  },
  },
  electrical_fixtures: {
    light_fixture:           { unit: 'EA',      low: 50,   avg: 140,  high: 350  },
    pot_light:               { unit: 'EA',      low: 18,   avg: 35,   high: 75   },
    bathroom_fan:            { unit: 'EA',      low: 90,   avg: 180,  high: 380  },
    gfi_receptacle:          { unit: 'EA',      low: 18,   avg: 32,   high: 55   },
    standard_receptacle:     { unit: 'EA',      low: 5,    avg: 10,   high: 20   },
    switch:                  { unit: 'EA',      low: 5,    avg: 10,   high: 18   },
    smart_switch:            { unit: 'EA',      low: 25,   avg: 55,   high: 120  },
  },
  cabinetry: {
    stock_kitchen_cabinets:  { unit: 'LF',      low: 120,  avg: 190,  high: 300  },
    semi_custom_cabinets:    { unit: 'LF',      low: 180,  avg: 280,  high: 420  },
    custom_cabinets:         { unit: 'LF',      low: 260,  avg: 380,  high: 600  },
    vanity_cabinet:          { unit: 'EA',      low: 220,  avg: 480,  high: 950  },
    cabinet_hardware:        { unit: 'EA',      low: 4,    avg: 9,    high: 20   },
    shelving:                { unit: 'LF',      low: 8,    avg: 16,   high: 32   },
  },
  countertops: {
    laminate:                { unit: 'LF',      low: 25,   avg: 40,   high: 65   },
    quartz:                  { unit: 'LF',      low: 60,   avg: 95,   high: 150  },
    stone_premium:           { unit: 'LF',      low: 80,   avg: 130,  high: 220  },
    backsplash_slab:         { unit: 'LF',      low: 20,   avg: 40,   high: 85   },
  },
  doors_trim: {
    interior_door:           { unit: 'EA',      low: 120,  avg: 240,  high: 500  },
    baseboard:               { unit: 'LF',      low: 1.2,  avg: 2.2,  high: 4.2  },
    casing:                  { unit: 'LF',      low: 1.3,  avg: 2.4,  high: 4.5  },
    crown_trim:              { unit: 'LF',      low: 1.8,  avg: 3.2,  high: 6.0  },
    door_hardware:           { unit: 'EA',      low: 22,   avg: 45,   high: 95   },
  },
  disposal: {
    disposal_bin_rental:     { unit: 'EA',      low: 200,  avg: 350,  high: 500  },
  },
};

// ─── Waste Factors ────────────────────────────────────────────────────────────

export const WASTE_FACTORS = {
  tile_standard:   0.10,
  tile_complex:    0.15,
  flooring_standard: 0.07,
  flooring_complex:  0.10,
  drywall:         0.10,
  framing_lumber:  0.09,
  paint:           0.10,
  waterproof_membrane: 0.09,
};

// ─── Repair/Patch Auto-Triggers ───────────────────────────────────────────────

export const REPAIR_TRIGGERS = {
  plumbing_wall_work:     200,   // $200 drywall repair allowance
  electrical_wall_access: 150,   // $150 drywall repair allowance
  drain_relocation:       350,   // $350 floor repair allowance
  tile_demolition:        200,   // $200 tile patch allowance
  structural_framing:     500,   // $500 repair allowance
  ceiling_plumbing:       200,   // $200 ceiling patch allowance
};

// ─── Confidence Scoring Model ─────────────────────────────────────────────────

export const CONFIDENCE_MODEL = {
  base: 90,
  deductions: {
    house_pre_1980:          -10,
    structural_wall_mod:     -15,
    drain_relocation:        -12,
    gas_line_change:         -10,
    exterior_penetration:    -8,
    basement_project:        -6,
    three_plus_unsure:       -10,
  },
  thresholds: {
    high:     { min: 85, label: 'High',     message: 'Minimal unknowns — estimate is reliable.' },
    moderate: { min: 70, label: 'Moderate', message: 'Some variables present — minor adjustments possible.' },
    low:      { min: 50, label: 'Low',      message: 'Multiple unknowns — recommend contractor site review.' },
    very_low: { min: 0,  label: 'Very Low', message: 'Site inspection strongly recommended before pricing.' },
  },
};

// ─── Quantity Engine ──────────────────────────────────────────────────────────

export function calculateQuantities(m: {
  lengthFt: string; widthFt: string; ceilingHeightFt: string;
  numDoors: string; numWindows: string; upperLinearFt?: string; lowerLinearFt?: string;
  countertopLinearFt?: string; showerLengthFt?: string; showerWidthFt?: string;
}) {
  const L = parseFloat(m.lengthFt) || 0;
  const W = parseFloat(m.widthFt) || 0;
  const H = parseFloat(m.ceilingHeightFt) || 9;
  const doors = parseInt(m.numDoors) || 0;
  const windows = parseInt(m.numWindows) || 0;

  const floorArea     = L * W;
  const perimeter     = 2 * (L + W);
  const grossWallArea = perimeter * H;
  const openingDeduction = (doors * 21) + (windows * 15); // standard defaults
  const netWallArea   = grossWallArea - openingDeduction;
  const ceilingArea   = L * W;
  const baseboardLf   = perimeter - (doors * 3);
  const casingLf      = (doors * 16) + (windows * 14);

  const showerL = parseFloat(m.showerLengthFt || '0') || 0;
  const showerW = parseFloat(m.showerWidthFt || '0') || 0;
  const shower_sqf = showerL > 0 && showerW > 0 ? Math.round(showerL * showerW) : 0;

  return {
    floor_area_sqf:      Math.round(floorArea),
    wall_area_gross_sqf: Math.round(grossWallArea),
    wall_area_net_sqf:   Math.round(netWallArea),
    ceiling_area_sqf:    Math.round(ceilingArea),
    perimeter_lf:        Math.round(perimeter),
    baseboard_lf:        Math.round(Math.max(0, baseboardLf)),
    casing_lf:           Math.round(casingLf),
    floor_tile_sqf:      Math.round(floorArea * (1 + WASTE_FACTORS.tile_standard)),
    upper_cabinet_lf:    parseFloat(m.upperLinearFt || '0') || 0,
    lower_cabinet_lf:    parseFloat(m.lowerLinearFt || '0') || 0,
    countertop_lf:       parseFloat(m.countertopLinearFt || '0') || 0,
    shower_sqf,
  };
}

// ─── TypeScript Cost Calculator ───────────────────────────────────────────────
// Computes realistic GTA project costs directly from the pricing data above.
// This is used to override AI guesses with data-driven numbers.

export interface CostEstimate {
  /** CAD cents — average total × 0.92 */
  min: number;
  /** CAD cents — average total × 1.08 */
  max: number;
  /** CAD dollars — for display/debugging */
  avgDollars: number;
  lineItems: Array<{ label: string; avgCad: number }>;
}

export function estimateProjectCost(params: {
  roomType: 'kitchen' | 'bathroom';
  qualityTier: 'budget' | 'mid-range' | 'luxury';
  answers: Record<string, string>;
  quantities?: ReturnType<typeof calculateQuantities> | null;
}): CostEstimate {
  const { roomType, qualityTier, answers, quantities } = params;
  const lines: Array<{ label: string; avgCad: number }> = [];

  const add = (label: string, avgCad: number) => {
    if (avgCad > 0) lines.push({ label, avgCad: Math.round(avgCad) });
  };

  // Helper: pick the right column based on quality tier
  const p = (entry: { low: number; avg: number; high: number }) =>
    qualityTier === 'luxury' ? entry.high : qualityTier === 'mid-range' ? entry.avg : entry.low;

  if (roomType === 'kitchen') {
    // ── Quantities (use measurements or GTA typical defaults) ──
    const cabinetLf     = (quantities?.upper_cabinet_lf ?? 0) + (quantities?.lower_cabinet_lf ?? 0) || 32;
    const counterLf     = quantities?.countertop_lf || 22;
    const floorSqf      = quantities?.floor_tile_sqf || 160;
    const wallSqf       = quantities?.wall_area_net_sqf || 420;
    const backsplashSqf = Math.min(counterLf * 1.5, 40);
    const baseboardLf   = quantities?.baseboard_lf || 50;

    // ── Demo ──
    add('Cabinet demolition & removal', p(LABOR_PRICING.demolition.kitchen_cabinet_removal) * cabinetLf);
    add('Floor removal', p(LABOR_PRICING.demolition.floor_removal) * floorSqf);

    // ── Cabinetry (material + install labor) ──
    const cabMat = qualityTier === 'luxury'
      ? MATERIAL_PRICING.cabinetry.custom_cabinets.high
      : qualityTier === 'mid-range'
      ? MATERIAL_PRICING.cabinetry.semi_custom_cabinets.avg
      : MATERIAL_PRICING.cabinetry.stock_kitchen_cabinets.low;
    const cabInstallLabor = qualityTier === 'luxury'
      ? LABOR_PRICING.cabinetry.custom_cabinet_install.high
      : p(LABOR_PRICING.cabinetry.kitchen_cabinet_install);
    add(`${qualityTier === 'luxury' ? 'Custom' : qualityTier === 'mid-range' ? 'Semi-custom' : 'Stock'} cabinets (material)`, cabMat * cabinetLf);
    add('Cabinet installation (labour)', cabInstallLabor * cabinetLf);

    // ── Countertops ──
    const ctRate = qualityTier === 'luxury'
      ? MATERIAL_PRICING.countertops.stone_premium.high
      : qualityTier === 'mid-range'
      ? MATERIAL_PRICING.countertops.quartz.avg
      : MATERIAL_PRICING.countertops.laminate.low;
    add('Countertop (supply, fabricate & install)', ctRate * counterLf);

    // ── Backsplash ──
    add('Backsplash tile (material)', p(MATERIAL_PRICING.tile_surface.backsplash_tile) * backsplashSqf);
    add('Backsplash tile install (labour)', p(LABOR_PRICING.tile.backsplash_tile_install) * backsplashSqf);

    // ── Flooring ──
    const floorMatRate = qualityTier === 'luxury'
      ? MATERIAL_PRICING.flooring.engineered_hardwood.high
      : qualityTier === 'mid-range'
      ? MATERIAL_PRICING.flooring.vinyl_plank.avg
      : MATERIAL_PRICING.flooring.vinyl_plank.low;
    const floorLaborRate = qualityTier === 'luxury'
      ? LABOR_PRICING.flooring.engineered_hardwood.high
      : p(LABOR_PRICING.flooring.vinyl_plank_install);
    add('Flooring material', floorMatRate * floorSqf * (1 + WASTE_FACTORS.flooring_standard));
    add('Flooring installation (labour)', floorLaborRate * floorSqf);

    // ── Plumbing (kitchen sink + faucet + rough-in) ──
    const hasMajorPlumb = answers['k_layout']?.includes('major');
    add('Kitchen sink & faucet', p(MATERIAL_PRICING.plumbing_fixtures.sink_basin) + p(MATERIAL_PRICING.plumbing_fixtures.sink_faucet));
    add('Sink installation (labour)', p(LABOR_PRICING.plumbing.vanity_install));
    if (hasMajorPlumb) {
      add('Plumbing relocation', p(LABOR_PRICING.plumbing.minor_plumbing_reloc));
    }

    // ── Appliances ──
    const appAnswer = answers['k_appliances'] ?? '';
    if (appAnswer.includes('k_app_full')) {
      const appCost = qualityTier === 'luxury' ? 25000 : qualityTier === 'mid-range' ? 10000 : 5000;
      add('Appliance suite (supply)', appCost);
      add('Appliance installation (labour)', qualityTier === 'luxury' ? 1800 : 1200);
    } else if (appAnswer.includes('k_app_some')) {
      const appCost = qualityTier === 'luxury' ? 9000 : qualityTier === 'mid-range' ? 4500 : 2200;
      add('Appliances (partial, supply)', appCost);
      add('Appliance installation (labour)', qualityTier === 'luxury' ? 800 : 500);
    }

    // ── Electrical ──
    const potLights = qualityTier === 'luxury' ? 8 : 6;
    add('Pot lights (material)', p(MATERIAL_PRICING.electrical_fixtures.pot_light) * potLights);
    add('Pot light installation (labour)', p(LABOR_PRICING.electrical.pot_light_install) * potLights);
    if (qualityTier !== 'budget') {
      add('Under-cabinet lighting (labour)', p(LABOR_PRICING.electrical.under_cabinet_lighting) * Math.min(counterLf, 15));
    }
    add('GFI outlets (material + labour)', (p(MATERIAL_PRICING.electrical_fixtures.gfi_receptacle) + p(LABOR_PRICING.electrical.gfi_outlet_install)) * 2);

    // ── Painting ──
    const paintGallons = Math.ceil(wallSqf / 350) + 1;
    add('Paint & primer (material)', p(MATERIAL_PRICING.paint.interior_wall_paint) * paintGallons);
    add('Wall painting (labour)', p(LABOR_PRICING.painting.interior_wall_painting) * wallSqf);
    add('Ceiling painting (labour)', p(LABOR_PRICING.painting.ceiling_painting) * (floorSqf * 1.05));

    // ── Drywall repair ──
    add('Drywall patch & repair', p(LABOR_PRICING.drywall.drywall_patch_repair) * 2);

    // ── Trim & baseboard ──
    add('Baseboard material', p(MATERIAL_PRICING.doors_trim.baseboard) * baseboardLf);
    add('Baseboard installation (labour)', p(LABOR_PRICING.carpentry.baseboard_install) * baseboardLf);

    // ── Disposal ──
    add('Disposal & dumpster', p(MATERIAL_PRICING.disposal.disposal_bin_rental));

    // ── Permits ──
    const hasStructural = answers['k_layout']?.includes('major');
    add('Building permit', hasStructural ? p(LABOR_PRICING.permit.permit_allowance) * 1.5 : p(LABOR_PRICING.permit.permit_allowance));

    // ── General contractor overhead (15%) ──
    const subtotal = lines.reduce((s, l) => s + l.avgCad, 0);
    add('General contractor overhead (15%)', subtotal * 0.15);

  } else {
    // ── BATHROOM ──
    const floorSqf  = quantities?.floor_tile_sqf || 65;
    const wallSqf   = quantities?.wall_area_net_sqf || 300;
    // Use measured shower dimensions when available; fallback to standard 3×5 = 45 sqf
    const showerSqf = quantities?.shower_sqf || 45;

    // Demo
    const hasShowerChange = !answers['b_shower']?.includes('keep');
    if (hasShowerChange) add('Full bathroom demolition', p(LABOR_PRICING.demolition.full_bathroom_demo));
    else {
      add('Tile demolition (partial)', p(LABOR_PRICING.demolition.tile_demolition) * floorSqf);
      add('Vanity & fixture removal', p(LABOR_PRICING.demolition.vanity_removal) + p(LABOR_PRICING.demolition.toilet_removal));
    }

    // Tile (floor)
    const tileAnswer = answers['b_tile'] ?? 'b_tile_full';
    const tileMat = p(MATERIAL_PRICING.tile_surface.floor_tile);
    if (!tileAnswer.includes('keep') && !tileAnswer.includes('shower')) {
      add('Floor tile (material)', tileMat * floorSqf * (1 + WASTE_FACTORS.tile_standard));
      add('Floor tile installation (labour)', p(LABOR_PRICING.tile.floor_tile_install) * floorSqf);
    }

    // Shower tile
    if (tileAnswer.includes('full') || tileAnswer.includes('shower')) {
      add('Shower tile (material)', p(MATERIAL_PRICING.tile_surface.shower_tile) * showerSqf * (1 + WASTE_FACTORS.tile_complex));
      add('Shower tile installation (labour)', p(LABOR_PRICING.tile.shower_tile_install) * showerSqf);
      add('Shower waterproofing membrane (material)', p(MATERIAL_PRICING.waterproofing.waterproof_membrane) * showerSqf);
      add('Shower waterproofing (labour)', p(LABOR_PRICING.waterproofing.shower_waterproof_membrane) * showerSqf);
    }

    // Tile consumables (grout, thinset, caulking) — per PDF implementation rules
    if (!tileAnswer.includes('keep')) {
      add('Grout & thinset (material)', p(MATERIAL_PRICING.tile_surface.grout) * 4 + p(MATERIAL_PRICING.tile_surface.thinset_mortar) * 3);
      add('Caulking & sealant (material)', p(MATERIAL_PRICING.tile_surface.silicone_sealant) * 3 + p(MATERIAL_PRICING.tile_surface.interior_caulking) * 2);
    }

    // Vanity
    if (!answers['b_vanity']?.includes('keep')) {
      add('Vanity cabinet (material)', p(MATERIAL_PRICING.cabinetry.vanity_cabinet));
      add('Sink & faucet', p(MATERIAL_PRICING.plumbing_fixtures.sink_basin) + p(MATERIAL_PRICING.plumbing_fixtures.sink_faucet));
      add('Vanity installation (labour)', p(LABOR_PRICING.plumbing.vanity_install));
    }

    // Toilet
    if (!answers['b_toilet']?.includes('keep')) {
      add('Toilet (material)', p(MATERIAL_PRICING.plumbing_fixtures.toilet));
      add('Toilet installation (labour)', p(LABOR_PRICING.plumbing.toilet_install));
    }

    // Shower/tub fixture
    const showerAns = answers['b_shower'] ?? '';
    if (showerAns.includes('walkin')) {
      add('Shower valve & trim', p(MATERIAL_PRICING.plumbing_fixtures.shower_valve_trim) + p(MATERIAL_PRICING.plumbing_fixtures.shower_head_kit));
      add('Shower base/pan (material)', p(MATERIAL_PRICING.plumbing_fixtures.shower_base_pan));
      add('Shower valve installation (labour)', p(LABOR_PRICING.plumbing.shower_valve_install));
      add('Drain installation (labour)', p(LABOR_PRICING.plumbing.drain_install));
    } else if (showerAns.includes('combo') || showerAns.includes('both')) {
      add('Bathtub (material)', p(MATERIAL_PRICING.plumbing_fixtures.bathtub));
      add('Tub installation (labour)', p(LABOR_PRICING.plumbing.tub_install));
      add('Shower valve & trim', p(MATERIAL_PRICING.plumbing_fixtures.shower_valve_trim));
      add('Shower valve installation (labour)', p(LABOR_PRICING.plumbing.shower_valve_install));
    }

    // Plumbing relocation
    const plumbAns = answers['b_plumbing'] ?? '';
    if (plumbAns.includes('major')) add('Drain relocation (wood floor)', p(LABOR_PRICING.plumbing.drain_reloc_wood_floor));
    else if (plumbAns.includes('minor')) add('Minor plumbing relocation', p(LABOR_PRICING.plumbing.minor_plumbing_reloc));

    // Electrical
    add('Bathroom exhaust fan (material + labour)', p(MATERIAL_PRICING.electrical_fixtures.bathroom_fan) + p(LABOR_PRICING.electrical.bathroom_fan_install));
    add('Lighting fixture (material + labour)', p(MATERIAL_PRICING.electrical_fixtures.light_fixture) + p(LABOR_PRICING.electrical.light_fixture_install));
    add('GFI outlet (material + labour)', p(MATERIAL_PRICING.electrical_fixtures.gfi_receptacle) + p(LABOR_PRICING.electrical.gfi_outlet_install));

    // Drywall (moisture-resistant, ~8 sheets for avg bathroom)
    const dwSheets = qualityTier === 'luxury' ? 10 : 8;
    add('Moisture-resistant drywall (material)', p(MATERIAL_PRICING.drywall.moisture_resist_dw) * dwSheets);
    add('Drywall installation (labour)', p(LABOR_PRICING.drywall.moisture_resistant_dw) * (wallSqf * 0.65));

    // Paint
    const paintableWall = wallSqf - showerSqf;
    add('Paint & primer (material)', p(MATERIAL_PRICING.paint.interior_wall_paint) * 2);
    add('Wall painting (labour)', p(LABOR_PRICING.painting.interior_wall_painting) * paintableWall);
    add('Ceiling painting (labour)', p(LABOR_PRICING.painting.ceiling_painting) * floorSqf);
    add('Ceiling paint (material)', p(MATERIAL_PRICING.paint.ceiling_paint) * Math.ceil(floorSqf / 350 + 1));

    // Baseboard
    const baseboardLf = quantities?.baseboard_lf || 22;
    add('Baseboard (material)', p(MATERIAL_PRICING.doors_trim.baseboard) * baseboardLf);
    add('Baseboard installation (labour)', p(LABOR_PRICING.carpentry.baseboard_install) * baseboardLf);

    // Disposal + permit
    add('Disposal & dumpster', p(MATERIAL_PRICING.disposal.disposal_bin_rental));
    add('Building permit', p(LABOR_PRICING.permit.permit_allowance));

    // GC overhead 15%
    const subtotal = lines.reduce((s, l) => s + l.avgCad, 0);
    add('General contractor overhead (15%)', subtotal * 0.15);

    // 10% contingency for bathroom (hidden moisture, rot, aged plumbing)
    const postGcSubtotal = lines.reduce((s, l) => s + l.avgCad, 0);
    add('Contingency allowance (10%)', postGcSubtotal * 0.10);
  }

  const avgDollars = Math.round(lines.reduce((s, l) => s + l.avgCad, 0));

  // ±1% with measurements (yields ~$200–$500 spread on typical job), ±5% without
  const rangeMultiplier = quantities?.floor_area_sqf ? 0.01 : 0.05;
  return {
    min: Math.round(avgDollars * (1 - rangeMultiplier)) * 100,
    max: Math.round(avgDollars * (1 + rangeMultiplier)) * 100,
    avgDollars,
    lineItems: lines,
  };
}

// ─── Format pricing reference for AI prompt ───────────────────────────────────

// ─── Material Price Lookup ─────────────────────────────────────────────────────
// Fuzzy-match a material item name to its Low/Average/High unit cost from the
// material pricing library. Returns null if no match found.

export interface MaterialPriceLookup {
  low: number;
  avg: number;
  high: number;
  unit: string;
}

export function lookupMaterialPrice(itemName: string): MaterialPriceLookup | null {
  const n = itemName.toLowerCase();

  // Cabinetry
  if (n.includes('custom cabinet') || n.includes('custom cab')) return { ...MATERIAL_PRICING.cabinetry.custom_cabinets, unit: 'LF' };
  if (n.includes('semi-custom') || n.includes('semi custom')) return { ...MATERIAL_PRICING.cabinetry.semi_custom_cabinets, unit: 'LF' };
  if (n.includes('kitchen cabinet') || (n.includes('cabinet') && !n.includes('vanity') && !n.includes('bathroom'))) return { ...MATERIAL_PRICING.cabinetry.stock_kitchen_cabinets, unit: 'LF' };
  if (n.includes('vanity cabinet') || (n.includes('vanity') && n.includes('cabinet'))) return { ...MATERIAL_PRICING.cabinetry.vanity_cabinet, unit: 'EA' };

  // Countertops
  if (n.includes('stone') || n.includes('marble') || n.includes('granite') || n.includes('premium countertop')) return { ...MATERIAL_PRICING.countertops.stone_premium, unit: 'LF' };
  if (n.includes('quartz')) return { ...MATERIAL_PRICING.countertops.quartz, unit: 'LF' };
  if (n.includes('laminate countertop') || n.includes('countertop')) return { ...MATERIAL_PRICING.countertops.laminate, unit: 'LF' };

  // Tile
  if (n.includes('shower tile') || n.includes('tile shower')) return { ...MATERIAL_PRICING.tile_surface.shower_tile, unit: 'SQF' };
  if (n.includes('backsplash tile') || n.includes('tile backsplash') || n.includes('backsplash')) return { ...MATERIAL_PRICING.tile_surface.backsplash_tile, unit: 'SQF' };
  if (n.includes('wall tile') || n.includes('tile wall')) return { ...MATERIAL_PRICING.tile_surface.wall_tile, unit: 'SQF' };
  if (n.includes('floor tile') || n.includes('tile floor') || n.includes('tile')) return { ...MATERIAL_PRICING.tile_surface.floor_tile, unit: 'SQF' };

  // Flooring
  if (n.includes('engineered hardwood') || n.includes('hardwood')) return { ...MATERIAL_PRICING.flooring.engineered_hardwood, unit: 'SQF' };
  if (n.includes('vinyl plank') || n.includes('lvp') || n.includes('vinyl')) return { ...MATERIAL_PRICING.flooring.vinyl_plank, unit: 'SQF' };
  if (n.includes('laminate floor') || n.includes('laminate')) return { ...MATERIAL_PRICING.flooring.laminate, unit: 'SQF' };
  if (n.includes('heated floor mat') || n.includes('heated floor')) return { ...MATERIAL_PRICING.flooring.heated_floor_mat, unit: 'SQF' };

  // Plumbing fixtures
  if (n.includes('bathtub') || n.includes('bath tub') || n.includes('soaker tub') || n.includes('freestanding tub')) return { ...MATERIAL_PRICING.plumbing_fixtures.bathtub, unit: 'EA' };
  if (n.includes('shower base') || n.includes('shower pan')) return { ...MATERIAL_PRICING.plumbing_fixtures.shower_base_pan, unit: 'EA' };
  if (n.includes('shower valve') || n.includes('shower trim')) return { ...MATERIAL_PRICING.plumbing_fixtures.shower_valve_trim, unit: 'EA' };
  if (n.includes('shower head') || n.includes('showerhead')) return { ...MATERIAL_PRICING.plumbing_fixtures.shower_head_kit, unit: 'EA' };
  if (n.includes('tub filler') || n.includes('tub faucet')) return { ...MATERIAL_PRICING.plumbing_fixtures.tub_filler_faucet, unit: 'EA' };
  if (n.includes('vanity') && !n.includes('cabinet')) return { ...MATERIAL_PRICING.plumbing_fixtures.vanity, unit: 'EA' };
  if (n.includes('sink faucet') || n.includes('kitchen faucet') || n.includes('faucet')) return { ...MATERIAL_PRICING.plumbing_fixtures.sink_faucet, unit: 'EA' };
  if (n.includes('sink') || n.includes('basin')) return { ...MATERIAL_PRICING.plumbing_fixtures.sink_basin, unit: 'EA' };
  if (n.includes('toilet')) return { ...MATERIAL_PRICING.plumbing_fixtures.toilet, unit: 'EA' };

  // Electrical fixtures
  if (n.includes('bathroom fan') || n.includes('exhaust fan') || n.includes('ventilation fan')) return { ...MATERIAL_PRICING.electrical_fixtures.bathroom_fan, unit: 'EA' };
  if (n.includes('pot light') || n.includes('recessed light') || n.includes('potlight')) return { ...MATERIAL_PRICING.electrical_fixtures.pot_light, unit: 'EA' };
  if (n.includes('smart switch')) return { ...MATERIAL_PRICING.electrical_fixtures.smart_switch, unit: 'EA' };
  if (n.includes('gfi') || n.includes('gfci') || n.includes('ground fault')) return { ...MATERIAL_PRICING.electrical_fixtures.gfi_receptacle, unit: 'EA' };
  if (n.includes('light fixture') || n.includes('lighting fixture') || n.includes('light')) return { ...MATERIAL_PRICING.electrical_fixtures.light_fixture, unit: 'EA' };

  // Waterproofing
  if (n.includes('shower pan kit') || n.includes('shower kit')) return { ...MATERIAL_PRICING.waterproofing.shower_pan_kit, unit: 'EA' };
  if (n.includes('waterproof membrane') || n.includes('waterproofing membrane')) return { ...MATERIAL_PRICING.waterproofing.waterproof_membrane, unit: 'SQF' };

  // Paint
  if (n.includes('ceiling paint')) return { ...MATERIAL_PRICING.paint.ceiling_paint, unit: 'Gallon' };
  if (n.includes('primer')) return { ...MATERIAL_PRICING.paint.primer, unit: 'Gallon' };
  if (n.includes('paint') || n.includes('painting')) return { ...MATERIAL_PRICING.paint.interior_wall_paint, unit: 'Gallon' };

  // Drywall
  if (n.includes('moisture resistant drywall') || n.includes('cement board')) return { ...MATERIAL_PRICING.drywall.moisture_resist_dw, unit: 'Sheet' };
  if (n.includes('drywall')) return { ...MATERIAL_PRICING.drywall.drywall_board, unit: 'Sheet' };

  // Trim / doors
  if (n.includes('baseboard')) return { ...MATERIAL_PRICING.doors_trim.baseboard, unit: 'LF' };
  if (n.includes('casing')) return { ...MATERIAL_PRICING.doors_trim.casing, unit: 'LF' };
  if (n.includes('interior door') || n.includes('door slab')) return { ...MATERIAL_PRICING.doors_trim.interior_door, unit: 'EA' };
  if (n.includes('door hardware')) return { ...MATERIAL_PRICING.doors_trim.door_hardware, unit: 'EA' };
  if (n.includes('cabinet hardware') || n.includes('hardware')) return { ...MATERIAL_PRICING.cabinetry.cabinet_hardware, unit: 'EA' };

  // Disposal
  if (n.includes('disposal') || n.includes('dumpster') || n.includes('bin')) return { ...MATERIAL_PRICING.disposal.disposal_bin_rental, unit: 'EA' };

  return null;
}

export function buildPricingPromptSection(): string {
  return `
=== WALKER AI PRICING REFERENCE (Ontario/GTA, CAD) ===
Use these exact price ranges for all line items. Format: Low / Average / High per unit.

LABOR - DEMOLITION:
- Full bathroom demo: EA $900/$1,200/$1,500
- Tile demo: SQF $4/$6/$8 | Drywall demo: SQF $2/$3/$4
- Tub removal: EA $150/$225/$300 | Vanity removal: EA $75/$110/$150
- Toilet removal: EA $50/$75/$100 | Kitchen cabinet removal: LF $15/$20/$30
- Floor removal: SQF $3/$5/$7 | Partition wall demo: LF $15/$25/$40

LABOR - PLUMBING:
- Toilet install: EA $250/$350/$450 | Vanity install: EA $350/$500/$650
- Shower valve: EA $300/$450/$600 | Drain install: EA $400/$600/$800
- Minor plumbing reloc: EA $700/$950/$1,200
- Drain reloc (wood floor): EA $1,500/$1,800/$2,500
- Drain reloc (slab): EA $3,000/$3,500/$6,500
- Tub install: EA $400/$650/$900 | Shower base: EA $300/$500/$750

LABOR - ELECTRICAL:
- GFI outlet: EA $120/$150/$180 | Standard outlet: EA $80/$100/$120
- Light fixture: EA $120/$180/$250 | Pot light: EA $120/$160/$220
- New circuit: EA $350/$550/$800 | Panel upgrade: EA $2,000/$2,800/$4,500
- Bathroom fan: EA $250/$400/$600 | Under-cabinet lighting: LF $30/$45/$65
- Switch: EA $80/$110/$140 | Smart switch: EA $120/$180/$250

LABOR - TILE:
- Floor tile install: SQF $10/$14/$18 | Wall tile: SQF $12/$18/$22
- Shower tile: SQF $15/$22/$28 | Backsplash: SQF $12/$18/$24
- Large format tile: SQF $16/$22/$30 | Heated floor tile: SQF $18/$24/$32

LABOR - FRAMING:
- Wall framing: LF $90/$110/$140 | Bulkhead: LF $70/$90/$110
- Door framing: EA $200/$300/$400 | Window framing: EA $200/$350/$500
- Structural header: EA $400/$700/$1,200

LABOR - DRYWALL:
- Drywall install: SQF $3/$5/$6 | Drywall finishing: SQF $2/$3/$4
- Moisture-resistant drywall: SQF $4/$6/$8 | Drywall patch: EA $100/$180/$300

LABOR - WATERPROOFING:
- Shower membrane: SQF $8/$11/$14 | Floor waterproofing: SQF $6/$9/$12
- Shower pan: EA $250/$400/$600

LABOR - FLOORING:
- Laminate install: SQF $5/$7/$9 | Engineered hardwood: SQF $7/$10/$14
- Vinyl plank: SQF $4/$6/$8 | Heated floor system: SQF $12/$18/$25

LABOR - CABINETRY:
- Kitchen cabinet install: LF $180/$250/$350 | Custom cabinet: LF $250/$350/$500
- Vanity cabinet install: EA $200/$350/$500 | Pantry cabinet: EA $350/$600/$900

LABOR - PAINTING:
- Interior walls: SQF $1.50/$2.25/$3.00 | Ceiling: SQF $1.50/$2.00/$2.75
- Trim: LF $2/$3/$4 | Door: EA $60/$90/$140 | Cabinet: LF $20/$30/$45

LABOR - CARPENTRY:
- Baseboard: LF $6/$9/$14 | Door install: EA $250/$400/$650
- Interior trim: LF $6/$10/$16 | Casing: LF $7/$10/$15

LABOR - RISK ALLOWANCES:
- Moisture damage: EA $800/$2,000/$5,000 | Mold remediation: EA $1,500/$2,500/$6,000
- Hidden plumbing: EA $600/$1,200/$3,000 | Structural: EA $1,000/$2,500/$7,000
- Floor leveling: SQF $5/$9/$15

LABOR - PERMIT: EA $800/$1,000/$2,500

MATERIALS - TILE/SURFACE:
- Floor tile: SQF $4/$7/$12 | Wall tile: SQF $5/$8/$15
- Shower tile: SQF $6/$10/$18 | Backsplash tile: SQF $5/$9/$16
- Grout: Bag $18/$28/$45 | Thinset: Bag $22/$35/$55

MATERIALS - CABINETRY:
- Stock kitchen cabinets: LF $120/$190/$300
- Semi-custom cabinets: LF $180/$280/$420
- Custom cabinets: LF $260/$380/$600
- Bathroom vanity cabinet: EA $220/$480/$950

MATERIALS - COUNTERTOPS:
- Laminate: LF $25/$40/$65 | Quartz: LF $60/$95/$150
- Stone/premium: LF $80/$130/$220

MATERIALS - PLUMBING FIXTURES:
- Toilet: EA $250/$425/$700 | Vanity: EA $400/$850/$1,500
- Sink faucet: EA $90/$180/$350 | Shower valve/trim: EA $150/$300/$650
- Bathtub: EA $500/$1,100/$2,200 | Shower base: EA $180/$350/$750

MATERIALS - FLOORING:
- Laminate: SQF $2.00/$3.50/$6.00 | Vinyl plank: SQF $2.50/$4.25/$7.00
- Engineered hardwood: SQF $4.50/$7.50/$12.00

WASTE FACTORS (apply to material quantities):
- Tile: 10% standard, 15% complex layouts
- Flooring: 7-10% | Drywall: 10% | Framing lumber: 8-10% | Paint: 10%

AUTOMATIC REPAIR ALLOWANCES (add to scope if applicable):
- Plumbing wall work → +$200 drywall allowance
- Electrical wall access → +$150 drywall allowance
- Drain relocation → +$350 floor repair allowance
- Tile demolition → +$200 tile patch allowance
- Structural framing → +$500 repair allowance

CONFIDENCE SCORING (include in response):
Base: 90%. Deduct: house pre-1980 (-10%), structural wall mod (-15%), drain relocation (-12%),
gas line change (-10%), exterior penetration (-8%), basement (-6%), 3+ unsure answers (-10%).
85-95% = High | 70-84% = Moderate | 50-69% = Low | <50% = Very Low (inspection recommended)
=== END PRICING REFERENCE ===`;
}
