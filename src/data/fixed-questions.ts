/**
 * Fixed questionnaire questions for the project wizard.
 * These are always the same — no AI variation — so every contractor
 * receives consistent, complete homeowner context.
 */

import type { QuestionnaireQuestion } from '@/types/database.types';

// ─── Kitchen Questions ────────────────────────────────────────────────────────

export const KITCHEN_QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: 'k_style',
    text: 'What design style are you going for?',
    type: 'single_select',
    context_note: 'Helps your contractor source the right finishes and hardware.',
    options: [
      { id: 'k_style_modern',        label: 'Modern / Contemporary — clean lines, minimal hardware', next_question_id: 'k_tier' },
      { id: 'k_style_transitional',  label: 'Transitional — blend of classic and modern',            next_question_id: 'k_tier' },
      { id: 'k_style_traditional',   label: 'Traditional / Classic — raised-panel cabinets, ornate detail', next_question_id: 'k_tier' },
      { id: 'k_style_farmhouse',     label: 'Farmhouse / Shaker — warm, rustic, beadboard accents',  next_question_id: 'k_tier' },
      { id: 'k_style_industrial',    label: 'Industrial — exposed materials, dark metals',            next_question_id: 'k_tier' },
    ],
  },
  {
    id: 'k_tier',
    text: 'What is your material quality level?',
    type: 'single_select',
    context_note: 'This determines the grade of cabinets, countertops, and fixtures we specify.',
    options: [
      { id: 'k_tier_budget',  label: 'Budget — stock cabinets, laminate countertops, basic fixtures',              next_question_id: 'k_cabinets' },
      { id: 'k_tier_mid',    label: 'Mid-range — semi-custom cabinets, quartz countertops, quality fixtures',      next_question_id: 'k_cabinets' },
      { id: 'k_tier_luxury', label: 'Luxury — custom cabinets, premium stone (marble/quartzite), high-end appliances', next_question_id: 'k_cabinets' },
    ],
  },
  {
    id: 'k_cabinets',
    text: 'What do you want done with the cabinets?',
    type: 'single_select',
    context_note: 'Cabinet work is typically 30–40% of a kitchen renovation budget.',
    options: [
      { id: 'k_cab_full',    label: 'Full replacement — new cabinets from scratch',              next_question_id: 'k_countertops' },
      { id: 'k_cab_reface',  label: 'Refacing — new doors & hardware, keep existing boxes',      next_question_id: 'k_countertops' },
      { id: 'k_cab_paint',   label: 'Paint/refinish only — keep everything, just repaint',       next_question_id: 'k_countertops' },
      { id: 'k_cab_keep',    label: 'Keep as-is — no cabinet work',                              next_question_id: 'k_countertops' },
    ],
  },
  {
    id: 'k_countertops',
    text: 'What countertop material would you like?',
    type: 'single_select',
    context_note: 'Material choice affects both cost and lead time for ordering.',
    options: [
      { id: 'k_ct_quartz',    label: 'Quartz — engineered stone, low maintenance, most popular',           next_question_id: 'k_appliances' },
      { id: 'k_ct_granite',   label: 'Granite — natural stone, unique patterns, durable',                 next_question_id: 'k_appliances' },
      { id: 'k_ct_marble',    label: 'Marble or Quartzite — premium natural stone, luxury look',          next_question_id: 'k_appliances' },
      { id: 'k_ct_porcelain', label: 'Porcelain slab — durable, large format, modern',                   next_question_id: 'k_appliances' },
      { id: 'k_ct_keep',      label: 'Keep existing countertops',                                         next_question_id: 'k_appliances' },
    ],
  },
  {
    id: 'k_appliances',
    text: 'Are you replacing the appliances?',
    type: 'single_select',
    context_note: 'Contractors need to know to coordinate cutout sizes and utility connections.',
    options: [
      { id: 'k_app_full',    label: 'Full suite — fridge, stove/range, dishwasher, and range hood', next_question_id: 'k_flooring' },
      { id: 'k_app_some',    label: 'Some appliances only (will specify with contractor)',           next_question_id: 'k_flooring' },
      { id: 'k_app_none',    label: 'No — keeping all existing appliances',                         next_question_id: 'k_flooring' },
    ],
  },
  {
    id: 'k_flooring',
    text: 'What is the plan for the kitchen floor?',
    type: 'single_select',
    context_note: 'Flooring is usually done last to protect it during the renovation.',
    options: [
      { id: 'k_floor_full',    label: 'Full replacement — new flooring throughout',             next_question_id: 'k_layout' },
      { id: 'k_floor_repair',  label: 'Repair / refinish existing floor',                      next_question_id: 'k_layout' },
      { id: 'k_floor_keep',    label: 'Keep existing flooring',                                next_question_id: 'k_layout' },
    ],
  },
  {
    id: 'k_layout',
    text: 'Are you making any layout or structural changes?',
    type: 'single_select',
    context_note: 'Moving walls or plumbing significantly impacts cost and permitting.',
    options: [
      { id: 'k_lay_none',   label: 'No — cosmetic refresh only, same layout',                         next_question_id: 'k_timeline' },
      { id: 'k_lay_minor',  label: 'Minor — repositioning a window, door, or small electrical change', next_question_id: 'k_timeline' },
      { id: 'k_lay_major',  label: 'Major — moving walls, relocating plumbing, or opening up space',  next_question_id: 'k_timeline' },
    ],
  },
  {
    id: 'k_timeline',
    text: 'What is your target timeline to start?',
    type: 'single_select',
    context_note: 'This helps contractors plan their schedule and material lead times.',
    options: [
      { id: 'k_time_asap',     label: 'ASAP — ready to start within the next 1–3 months',   next_question_id: 'k_home' },
      { id: 'k_time_standard', label: 'Standard — within 3–6 months',                       next_question_id: 'k_home' },
      { id: 'k_time_flexible', label: 'Flexible — no hard deadline, 6+ months out',          next_question_id: 'k_home' },
    ],
  },
  {
    id: 'k_home',
    text: 'Will you be living at home during the renovation?',
    type: 'single_select',
    context_note: 'This affects the contractor\'s work schedule and dust control requirements.',
    options: [
      { id: 'k_home_yes',     label: 'Yes — I\'ll be staying home throughout',             next_question_id: null },
      { id: 'k_home_partial', label: 'Partially — home some days but have flexibility',    next_question_id: null },
      { id: 'k_home_no',      label: 'No — I have alternative accommodation arranged',     next_question_id: null },
    ],
  },
];

// ─── Bathroom Questions ───────────────────────────────────────────────────────

export const BATHROOM_QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: 'b_style',
    text: 'What design style are you going for?',
    type: 'single_select',
    context_note: 'Helps your contractor source the right tile, fixtures, and finishes.',
    options: [
      { id: 'b_style_modern',        label: 'Modern / Spa — clean lines, frameless glass, floating vanity', next_question_id: 'b_tier' },
      { id: 'b_style_transitional',  label: 'Transitional — blend of classic and modern',                   next_question_id: 'b_tier' },
      { id: 'b_style_traditional',   label: 'Traditional / Classic — ornate fixtures, wainscoting',         next_question_id: 'b_tier' },
      { id: 'b_style_farmhouse',     label: 'Farmhouse — shiplap, freestanding tub, matte black fixtures',  next_question_id: 'b_tier' },
      { id: 'b_style_industrial',    label: 'Industrial — concrete, exposed pipe, dark tones',              next_question_id: 'b_tier' },
    ],
  },
  {
    id: 'b_tier',
    text: 'What is your material quality level?',
    type: 'single_select',
    context_note: 'This determines the grade of tile, fixtures, and vanity we specify.',
    options: [
      { id: 'b_tier_budget',  label: 'Budget — builder-grade tile and fixtures, functional finish',              next_question_id: 'b_shower' },
      { id: 'b_tier_mid',    label: 'Mid-range — quality porcelain tile, semi-custom vanity, quality fixtures', next_question_id: 'b_shower' },
      { id: 'b_tier_luxury', label: 'Luxury — natural stone, custom vanity, premium fixtures and hardware',     next_question_id: 'b_shower' },
    ],
  },
  {
    id: 'b_shower',
    text: 'What is the shower/tub plan?',
    type: 'single_select',
    context_note: 'The shower enclosure is usually the largest cost item in a bathroom reno.',
    options: [
      { id: 'b_sh_walkin',  label: 'Walk-in shower only — remove tub, install curbless or curbed shower', next_question_id: 'b_vanity' },
      { id: 'b_sh_combo',   label: 'Tub/shower combo — standard alcove or standalone',                   next_question_id: 'b_vanity' },
      { id: 'b_sh_both',    label: 'Separate soaker tub + separate shower',                               next_question_id: 'b_vanity' },
      { id: 'b_sh_keep',    label: 'Keep existing shower/tub layout',                                    next_question_id: 'b_vanity' },
    ],
  },
  {
    id: 'b_vanity',
    text: 'What are you doing with the vanity?',
    type: 'single_select',
    context_note: 'Vanity style and size directly impacts counter and sink specifications.',
    options: [
      { id: 'b_van_single',  label: 'New single vanity',                                next_question_id: 'b_tile' },
      { id: 'b_van_double',  label: 'New double vanity (if space allows)',               next_question_id: 'b_tile' },
      { id: 'b_van_floating', label: 'Floating/wall-mount vanity',                      next_question_id: 'b_tile' },
      { id: 'b_van_keep',    label: 'Keep and refinish existing vanity',                next_question_id: 'b_tile' },
    ],
  },
  {
    id: 'b_tile',
    text: 'What is the scope of the tile work?',
    type: 'single_select',
    context_note: 'Tile is priced per square foot — this determines the full take-off.',
    options: [
      { id: 'b_tile_full',    label: 'Full tile job — floor, shower walls, and feature wall',    next_question_id: 'b_toilet' },
      { id: 'b_tile_shower',  label: 'Shower/tub area only',                                    next_question_id: 'b_toilet' },
      { id: 'b_tile_floor',   label: 'Floor tile only',                                         next_question_id: 'b_toilet' },
      { id: 'b_tile_keep',    label: 'Keep existing tile',                                      next_question_id: 'b_toilet' },
    ],
  },
  {
    id: 'b_toilet',
    text: 'What about the toilet?',
    type: 'single_select',
    context_note: 'Helps the plumber plan their scope of work.',
    options: [
      { id: 'b_toil_replace', label: 'Replace with new toilet',   next_question_id: 'b_plumbing' },
      { id: 'b_toil_keep',    label: 'Keep existing toilet',      next_question_id: 'b_plumbing' },
    ],
  },
  {
    id: 'b_plumbing',
    text: 'Are you moving any plumbing?',
    type: 'single_select',
    context_note: 'Moving drains or supply lines significantly increases cost and complexity.',
    options: [
      { id: 'b_plumb_none',   label: 'No — keeping all fixtures in the same location',         next_question_id: 'b_timeline' },
      { id: 'b_plumb_minor',  label: 'Minor relocation (1–2 feet, same wall)',                 next_question_id: 'b_timeline' },
      { id: 'b_plumb_major',  label: 'Major relocation (different wall or drain relocation)',  next_question_id: 'b_timeline' },
    ],
  },
  {
    id: 'b_timeline',
    text: 'What is your target timeline to start?',
    type: 'single_select',
    context_note: 'Helps contractors schedule and order materials with appropriate lead time.',
    options: [
      { id: 'b_time_asap',     label: 'ASAP — ready to start within 1–3 months',  next_question_id: 'b_home' },
      { id: 'b_time_standard', label: 'Standard — within 3–6 months',             next_question_id: 'b_home' },
      { id: 'b_time_flexible', label: 'Flexible — no hard deadline, 6+ months',   next_question_id: 'b_home' },
    ],
  },
  {
    id: 'b_home',
    text: 'Will you be living at home during the renovation?',
    type: 'single_select',
    context_note: 'Affects daily work hours and dust/noise management.',
    options: [
      { id: 'b_home_yes',     label: 'Yes — I\'ll be home throughout',              next_question_id: null },
      { id: 'b_home_partial', label: 'Partially — home some days, flexible others', next_question_id: null },
      { id: 'b_home_no',      label: 'No — I have alternative accommodation',       next_question_id: null },
    ],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

export function getQuestionsForRoomType(roomType: string): QuestionnaireQuestion[] {
  return roomType === 'bathroom' ? BATHROOM_QUESTIONS : KITCHEN_QUESTIONS;
}

/**
 * Extracts a human-readable label for a given answer ID.
 * Used to inject context into the brief prompt.
 */
export function resolveAnswerLabel(
  questions: QuestionnaireQuestion[],
  questionId: string,
  answerId: string,
): string {
  const q = questions.find(q => q.id === questionId);
  const opt = q?.options.find(o => o.id === answerId);
  return opt?.label ?? answerId;
}

/**
 * Returns the quality tier string from the questionnaire answers.
 * 'budget' | 'mid-range' | 'luxury'
 */
export function extractQualityTier(answers: Record<string, string>): 'budget' | 'mid-range' | 'luxury' {
  const tierAnswer = answers['k_tier'] ?? answers['b_tier'] ?? '';
  if (tierAnswer.includes('luxury')) return 'luxury';
  if (tierAnswer.includes('mid'))    return 'mid-range';
  return 'budget';
}

/**
 * Formats all questionnaire answers as a readable summary for the AI brief prompt.
 */
export function buildAnswerSummary(
  questions: QuestionnaireQuestion[],
  answers: Record<string, string>,
): string {
  const lines: string[] = [];
  for (const q of questions) {
    const answerId = answers[q.id];
    if (!answerId) continue;
    const label = resolveAnswerLabel(questions, q.id, answerId);
    // Strip the parenthetical cost note for cleaner output
    const cleanLabel = label.split('—')[0].trim();
    lines.push(`- ${q.text}: ${cleanLabel}`);
  }
  return lines.join('\n');
}
