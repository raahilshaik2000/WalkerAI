import { NativeModules, Platform } from 'react-native';
import type { QuestionnaireQuestion } from '@/types/database.types';

type WalkerVoiceAssistantModule = {
  requestPermissions: () => Promise<{ speech: boolean; microphone: boolean }>;
  speak: (text: string) => Promise<{ spoken: boolean }>;
  stopSpeaking: () => Promise<{ stopped: boolean }>;
  cancelListening?: () => Promise<{ cancelled: boolean }>;
  listenOnce: (locale: string, durationSeconds: number, contextualStrings: string[]) => Promise<{ transcript: string; cancelled?: boolean }>;
};

const nativeVoice = NativeModules.WalkerVoiceAssistant as WalkerVoiceAssistantModule | undefined;

export interface VoiceOptionMatch {
  optionId: string;
  confidence: number;
  reason: 'position' | 'exact' | 'primary' | 'keywords';
}

export interface VoiceOptionExplanation {
  optionId: string | null;
  recommendedOptionId?: string | null;
  recommendedOptionLabel?: string | null;
  label: string;
  detail: string;
}

type OptionPhraseRule = {
  optionId: string;
  aliases: string[];
  patterns: RegExp[];
};

type PreferenceOptionRule = {
  optionId: string;
  confidence: number;
  patterns: RegExp[];
};

export function isProjectVoiceAvailable() {
  return Platform.OS === 'ios'
    && !!nativeVoice?.requestPermissions
    && !!nativeVoice?.speak
    && !!nativeVoice?.listenOnce;
}

export async function requestProjectVoicePermissions() {
  if (!isProjectVoiceAvailable() || !nativeVoice) {
    return { speech: false, microphone: false };
  }
  return nativeVoice.requestPermissions();
}

export async function speakProjectQuestion(question: QuestionnaireQuestion) {
  const options = question.options.map((option, index) => {
    const [label, detail] = option.label.split('—').map((part) => part.trim());
    return detail
      ? `Option ${index + 1}: ${label}, ${detail}`
      : `Option ${index + 1}: ${label}`;
  }).join('. ');
  await speakProjectPrompt(`${question.text}. ${options}. You can say an option number, answer in your own words, ask me to repeat, or say help me choose.`);
}

export async function speakProjectDecisionHelp(question: QuestionnaireQuestion) {
  const context = question.context_note ? `${question.context_note} ` : '';
  const recommendation = decisionRecommendation(question);
  const defaultRecommendation = recommendedOptionForQuestion(question);
  const defaultRecommendationText = defaultRecommendation
    ? `My default recommendation is option ${defaultRecommendation.index + 1}: ${defaultRecommendation.label}. `
    : '';
  const optionGuidance = question.options.map((option, index) => {
    const [label, detail] = option.label.split('—').map((part) => part.trim());
    return detail
      ? `Option ${index + 1}, ${label}, means ${detail}.`
      : `Option ${index + 1} is ${label}.`;
  }).join(' ');
  await speakProjectPrompt(`${context}${recommendation}${defaultRecommendationText}${optionGuidance} Which one sounds closest?`);
}

export async function speakProjectOptionExplanation(explanation: VoiceOptionExplanation) {
  if (!explanation.optionId) {
    const recommendation = explanation.recommendedOptionId
      ? ` My recommendation is ${explanation.recommendedOptionLabel}.`
      : '';
    await speakProjectPrompt(`${explanation.detail}${recommendation} You can choose one, ask about another option, or say help me choose.`);
    return;
  }

  const detail = explanation.detail
    ? `${explanation.label} means ${explanation.detail}.`
    : `${explanation.label} is one of the available options.`;
  await speakProjectPrompt(`${detail} You can choose it, ask about another option, or say help me choose.`);
}

export async function speakProjectPrompt(text: string) {
  if (!nativeVoice?.speak) return;
  await nativeVoice.speak(text);
}

export async function listenForProjectAnswer(durationSeconds = 7, contextTerms: string[] = []) {
  if (!nativeVoice?.listenOnce) {
    throw new Error('Voice answers are not available on this device.');
  }
  const result = await nativeVoice.listenOnce('en-CA', durationSeconds, contextTerms);
  if (result.cancelled) return 'voice cancelled';
  return result.transcript.trim();
}

export async function stopProjectVoice() {
  const stopTasks: Array<Promise<unknown>> = [];
  if (nativeVoice?.stopSpeaking) stopTasks.push(nativeVoice.stopSpeaking());
  if (nativeVoice?.cancelListening) stopTasks.push(nativeVoice.cancelListening());
  await Promise.allSettled(stopTasks);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandNaturalAnswerPhrases(value: string) {
  const expansions: string[] = [];

  if (/\b(as soon as possible|right away|immediately)\b/.test(value)) {
    expansions.push('asap');
  }

  if (/\b(mid range|middle range)\b/.test(value)) {
    expansions.push('mid range quality semi custom standard good quality');
  }

  if (/\b(cheap|cheapest|affordable|low cost|save money|basic|builder grade)\b/.test(value)) {
    expansions.push('budget stock basic builder grade functional');
  }

  if (/\b(high end|premium|top of the line|best quality|highest quality|luxury)\b/.test(value)) {
    expansions.push('luxury custom premium high end natural stone');
  }

  if (/\b(good quality|better quality|not too cheap|not too expensive|middle of the road)\b/.test(value)) {
    expansions.push('mid range quality semi custom');
  }

  if (/\b(don t|dont|do not|not)\s+(move|relocate|change)\b/.test(value) || /\bsame layout\b/.test(value)) {
    expansions.push('no cosmetic refresh same layout keeping all fixtures in the same location');
  }

  if (/\b(keep|keeping|leave|leaving|don t replace|dont replace|do not replace)\b/.test(value)
    && /\b(appliance|appliances|cabinet|cabinets|countertop|countertops|floor|flooring|tile|toilet|vanity|shower|tub|layout|existing|current|as is)\b/.test(value)) {
    expansions.push('keep existing');
  }

  if (/\b(some|a few|couple)\b/.test(value) && /\b(appliance|appliances)\b/.test(value)) {
    expansions.push('some appliances only');
  }

  if (/\b(all|everything|full suite)\b/.test(value) && /\b(appliance|appliances|fridge|stove|dishwasher|range hood)\b/.test(value)) {
    expansions.push('full suite fridge stove dishwasher range hood');
  }

  if (/\b(stay|staying|live|living)\b/.test(value) && /\b(home|house|there|here)\b/.test(value)) {
    expansions.push('yes staying home throughout');
  }

  if (/\b(move out|moving out|not living|won t live|wont live|somewhere else|alternative accommodation)\b/.test(value)) {
    expansions.push('no alternative accommodation arranged');
  }

  if (/\b(part time|partially|some days|sometimes)\b/.test(value) && /\b(home|house|there|here)\b/.test(value)) {
    expansions.push('partially home some days flexibility');
  }

  if (/\b(next month|next few weeks|soon|right away|immediately)\b/.test(value)) {
    expansions.push('asap ready start within next 1 3 months');
  }

  if (/\b(three months|3 months|few months|spring|summer|fall|winter)\b/.test(value)) {
    expansions.push('standard within 3 6 months');
  }

  if (/\b(six months|6 months|no rush|not in a rush|flexible|later)\b/.test(value)) {
    expansions.push('flexible no hard deadline 6 months');
  }

  if (/\b(walk in|walkin|shower only|no tub)\b/.test(value)) {
    expansions.push('walk in shower only remove tub');
  }

  if (/\b(tub shower|shower tub|combo|alcove)\b/.test(value)) {
    expansions.push('tub shower combo standard alcove');
  }

  if (/\b(soaker|separate tub|separate shower)\b/.test(value)) {
    expansions.push('separate soaker tub separate shower');
  }

  if (/\b(single sink|one sink|single vanity)\b/.test(value)) {
    expansions.push('new single vanity');
  }

  if (/\b(double sink|two sinks|double vanity)\b/.test(value)) {
    expansions.push('new double vanity');
  }

  if (/\b(floating|wall mount|wall mounted)\b/.test(value) && /\b(vanity|sink)\b/.test(value)) {
    expansions.push('floating wall mount vanity');
  }

  if (/\b(floor only|only the floor)\b/.test(value)) {
    expansions.push('floor tile only');
  }

  if (/\b(shower only|only the shower|tub area)\b/.test(value)) {
    expansions.push('shower tub area only');
  }

  if (/\b(all tile|full tile|everything tiled)\b/.test(value)) {
    expansions.push('full tile job floor shower walls feature wall');
  }

  return expansions.length ? `${value} ${expansions.join(' ')}` : value;
}

const STOP_WORDS = new Set([
  'and',
  'are',
  'but',
  'for',
  'from',
  'have',
  'like',
  'only',
  'option',
  'that',
  'the',
  'then',
  'this',
  'want',
  'with',
  'would',
]);

function labelKeywords(label: string) {
  const beforeDash = label.split('—')[0];
  const seen = new Set<string>();
  return normalize(`${beforeDash} ${label}`)
    .split(' ')
    .filter((token) => {
      const keep = token.length > 2 && !STOP_WORDS.has(token) && !seen.has(token);
      seen.add(token);
      return keep;
    });
}

function tokenMatchesKeyword(token: string, keyword: string) {
  if (token === keyword) return true;
  const shortest = Math.min(token.length, keyword.length);
  return shortest >= 4
    && Math.abs(token.length - keyword.length) <= 2
    && (token.startsWith(keyword) || keyword.startsWith(token));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function transcriptHasKeyword(keyword: string, transcriptTokens: string[], normalizedTranscript: string) {
  return normalizedTranscript.includes(keyword)
    || transcriptTokens.some((token) => tokenMatchesKeyword(token, keyword));
}

const NUMBER_WORDS: Record<string, number> = {
  won: 1,
  one: 1,
  first: 1,
  too: 2,
  to: 2,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  for: 4,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  ate: 8,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
};

function optionIdFromPosition(value: string, question: QuestionnaireQuestion) {
  if (value === 'last' || value === 'final') {
    return question.options[question.options.length - 1]?.id ?? null;
  }

  const number = /^\d+$/.test(value) ? Number(value) : NUMBER_WORDS[value];
  if (!number) return null;

  return question.options[number - 1]?.id ?? null;
}

function optionPositionMatch(transcript: string, question: QuestionnaireQuestion): VoiceOptionMatch | null {
  const spokenOptionMatch = transcript.match(/\b(?:option|number|choice|answer)\s+(\d+|[a-z]+)\b/)
    ?? transcript.match(/\b(?:pick|select|choose)\s+(?:option|number|choice|answer)?\s*(\d+|[a-z]+|last|final)\b/)
    ?? transcript.match(/\b(?:the\s+)?(\d+|[a-z]+)\s+(?:one|option|choice|answer)\b/)
    ?? transcript.match(/\b(?:go\s+with|use|take)\s+(?:the\s+)?(\d+|[a-z]+|last|final)\b/)
    ?? transcript.match(/^(\d+|[a-z]+|last|final)$/);
  if (!spokenOptionMatch) return null;

  const optionId = optionIdFromPosition(spokenOptionMatch[1], question);
  return optionId ? { optionId, confidence: 1, reason: 'position' } : null;
}

function tokenList(value: string) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function decisionRecommendation(question: QuestionnaireQuestion) {
  const recommendations: Record<string, string> = {
    k_style: 'A safe choice for resale is transitional. Choose modern if you want a cleaner minimal look, or farmhouse if you want warmer shaker details. ',
    b_style: 'A safe choice for resale is modern spa or transitional. Choose farmhouse for warmer black fixture details, or traditional if you want a more classic finish. ',
    k_tier: 'If budget is the priority, choose budget. If you want a strong balance of durability and price, choose mid-range. Choose luxury only if premium finishes matter most. ',
    b_tier: 'If budget is the priority, choose budget. For most renovations, mid-range is the practical balance. Choose luxury for natural stone or custom fixtures. ',
    k_cabinets: 'If the boxes are in good shape, refacing or repainting can save money. Choose full replacement when the layout, boxes, or storage need a real change. ',
    k_countertops: 'Quartz is usually the safest low-maintenance choice. Granite gives natural variation. Marble or quartzite is more premium, and keeping existing counters saves budget. ',
    k_appliances: 'Choose full suite if you want all cutouts coordinated at once. Choose some appliances if only a few are changing, or no if you are keeping the current set. ',
    k_flooring: 'Choose full replacement for a clean finished renovation. Choose repair or refinish if the existing floor is worth saving. Choose keep if the floor is already fine. ',
    k_layout: 'Choose no layout changes for the simplest budget. Choose minor if only doors, windows, or small electrical items move. Choose major for walls or plumbing moves. ',
    b_shower: 'A walk-in shower is common for a modern upgrade. A tub shower combo is practical for families. Choose keep if the current layout works. ',
    b_vanity: 'A single vanity is practical for smaller bathrooms. Double vanity is best if space allows. Floating vanity gives a modern look. ',
    b_tile: 'Full tile gives the most complete renovation. Shower area only controls cost. Floor only is a smaller scope. Keeping tile saves budget. ',
    b_toilet: 'Choose replace if you want a clean finished renovation. Choose keep if the current toilet is newer and working well. ',
    b_plumbing: 'Choose no plumbing moves for the simplest budget. Minor is for same-wall moves. Major is for different walls or drain relocation. ',
    k_timeline: 'Choose ASAP only if you are ready to start soon. Standard is best if you need planning time. Flexible helps contractors schedule around availability. ',
    b_timeline: 'Choose ASAP only if you are ready to start soon. Standard is best if you need planning time. Flexible helps contractors schedule around availability. ',
    k_home: 'Choose yes if you will live through the work, partially if you have some flexibility, or no if you can stay somewhere else. ',
    b_home: 'Choose yes if you will live through the work, partially if you have some flexibility, or no if you can stay somewhere else. ',
  };

  return recommendations[question.id] ?? '';
}

const DEFAULT_RECOMMENDED_OPTION_IDS: Record<string, string> = {
  k_style: 'k_style_transitional',
  b_style: 'b_style_modern',
  k_tier: 'k_tier_mid',
  b_tier: 'b_tier_mid',
  k_cabinets: 'k_cab_reface',
  k_countertops: 'k_ct_quartz',
  k_appliances: 'k_app_full',
  k_flooring: 'k_floor_full',
  k_layout: 'k_lay_none',
  b_shower: 'b_sh_walkin',
  b_vanity: 'b_van_single',
  b_tile: 'b_tile_shower',
  b_toilet: 'b_toil_replace',
  b_plumbing: 'b_plumb_none',
  k_timeline: 'k_time_standard',
  b_timeline: 'b_time_standard',
  k_home: 'k_home_partial',
  b_home: 'b_home_partial',
};

const COMPARISON_OPTION_PRIORITY: Record<string, string[]> = {
  k_style: ['k_style_transitional', 'k_style_modern', 'k_style_farmhouse', 'k_style_traditional', 'k_style_industrial'],
  b_style: ['b_style_modern', 'b_style_transitional', 'b_style_farmhouse', 'b_style_traditional', 'b_style_industrial'],
  k_tier: ['k_tier_mid', 'k_tier_budget', 'k_tier_luxury'],
  b_tier: ['b_tier_mid', 'b_tier_budget', 'b_tier_luxury'],
  k_cabinets: ['k_cab_reface', 'k_cab_paint', 'k_cab_full', 'k_cab_keep'],
  k_countertops: ['k_ct_quartz', 'k_ct_granite', 'k_ct_porcelain', 'k_ct_marble', 'k_ct_keep'],
  k_appliances: ['k_app_full', 'k_app_some', 'k_app_none'],
  k_flooring: ['k_floor_full', 'k_floor_repair', 'k_floor_keep'],
  k_layout: ['k_lay_none', 'k_lay_minor', 'k_lay_major'],
  b_shower: ['b_sh_walkin', 'b_sh_combo', 'b_sh_keep', 'b_sh_both'],
  b_vanity: ['b_van_single', 'b_van_double', 'b_van_floating', 'b_van_keep'],
  b_tile: ['b_tile_shower', 'b_tile_floor', 'b_tile_full', 'b_tile_keep'],
  b_toilet: ['b_toil_replace', 'b_toil_keep'],
  b_plumbing: ['b_plumb_none', 'b_plumb_minor', 'b_plumb_major'],
  k_timeline: ['k_time_standard', 'k_time_flexible', 'k_time_asap'],
  b_timeline: ['b_time_standard', 'b_time_flexible', 'b_time_asap'],
  k_home: ['k_home_partial', 'k_home_no', 'k_home_yes'],
  b_home: ['b_home_partial', 'b_home_no', 'b_home_yes'],
};

export function recommendedOptionForQuestion(question: QuestionnaireQuestion) {
  const recommendedOptionId = DEFAULT_RECOMMENDED_OPTION_IDS[question.id];
  if (!recommendedOptionId) return null;

  const index = question.options.findIndex((option) => option.id === recommendedOptionId);
  const option = index >= 0 ? question.options[index] : null;
  if (!option) return null;

  return {
    id: option.id,
    index,
    label: option.label.split('—')[0].trim(),
  };
}

function recommendedComparisonMatch(
  question: QuestionnaireQuestion,
  matches: VoiceOptionExplanation[],
) {
  const matchById = new Map(matches.map((match) => [match.optionId, match]));
  const priority = COMPARISON_OPTION_PRIORITY[question.id] ?? [
    DEFAULT_RECOMMENDED_OPTION_IDS[question.id],
    ...question.options.map((option) => option.id),
  ].filter((optionId): optionId is string => !!optionId);

  return priority
    .map((optionId) => matchById.get(optionId))
    .find((match): match is VoiceOptionExplanation => !!match) ?? null;
}

const PREFERENCE_OPTION_RULES: Record<string, PreferenceOptionRule[]> = {
  k_style: [
    { optionId: 'k_style_transitional', confidence: 0.9, patterns: [/\bresale\b/, /\bsafe choice\b/, /\bbest value\b/, /\bbalanced\b/] },
    { optionId: 'k_style_modern', confidence: 0.88, patterns: [/\bminimal\b/, /\bclean\b/, /\bsleek\b/] },
    { optionId: 'k_style_farmhouse', confidence: 0.88, patterns: [/\bwarm\b/, /\bcozy\b/, /\bshaker\b/] },
  ],
  b_style: [
    { optionId: 'b_style_modern', confidence: 0.9, patterns: [/\bresale\b/, /\bspa\b/, /\bhotel\b/, /\bclean\b/, /\bsleek\b/] },
    { optionId: 'b_style_transitional', confidence: 0.88, patterns: [/\bsafe choice\b/, /\bbest value\b/, /\bbalanced\b/] },
    { optionId: 'b_style_farmhouse', confidence: 0.86, patterns: [/\bwarm\b/, /\bcozy\b/, /\bmatte black\b/] },
  ],
  k_tier: [
    { optionId: 'k_tier_budget', confidence: 0.95, patterns: [/\b(cheapest|affordable|low cost|save money|tight budget)\b/, /\bcheap\b(?!\s+but)/] },
    { optionId: 'k_tier_mid', confidence: 0.92, patterns: [/\bbest value\b/, /\bbalanced\b/, /\bpractical\b/, /\bgood quality\b/, /\bnot too expensive\b/] },
    { optionId: 'k_tier_luxury', confidence: 0.92, patterns: [/\bbest\b/, /\bpremium\b/, /\bluxury\b/, /\bhigh end\b/] },
  ],
  b_tier: [
    { optionId: 'b_tier_budget', confidence: 0.95, patterns: [/\b(cheapest|affordable|low cost|save money|tight budget)\b/, /\bcheap\b(?!\s+but)/] },
    { optionId: 'b_tier_mid', confidence: 0.92, patterns: [/\bbest value\b/, /\bbalanced\b/, /\bpractical\b/, /\bgood quality\b/, /\bnot too expensive\b/] },
    { optionId: 'b_tier_luxury', confidence: 0.92, patterns: [/\bbest\b/, /\bpremium\b/, /\bluxury\b/, /\bhigh end\b/] },
  ],
  k_cabinets: [
    { optionId: 'k_cab_paint', confidence: 0.88, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'k_cab_reface', confidence: 0.9, patterns: [/\bbest value\b/, /\bbalanced\b/, /\bboxes are good\b/, /\bkeep boxes\b/] },
    { optionId: 'k_cab_full', confidence: 0.88, patterns: [/\bbest\b/, /\bnew layout\b/, /\bmore storage\b/, /\bfull renovation\b/] },
  ],
  k_countertops: [
    { optionId: 'k_ct_keep', confidence: 0.88, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'k_ct_quartz', confidence: 0.95, patterns: [/\b(low|lowest)\s+maintenance\b/, /\bdurable\b/, /\beasy to clean\b/, /\bbest value\b/, /\bresale\b/] },
    { optionId: 'k_ct_granite', confidence: 0.86, patterns: [/\bnatural\b/, /\bunique\b/] },
    { optionId: 'k_ct_marble', confidence: 0.88, patterns: [/\bluxury\b/, /\bpremium\b/, /\bhigh end\b/] },
  ],
  k_appliances: [
    { optionId: 'k_app_none', confidence: 0.9, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'k_app_some', confidence: 0.88, patterns: [/\bbest value\b/, /\bpractical\b/, /\bonly what needs it\b/] },
    { optionId: 'k_app_full', confidence: 0.88, patterns: [/\bcoordinate\b/, /\bcomplete\b/, /\bfull renovation\b/, /\ball new\b/] },
  ],
  k_flooring: [
    { optionId: 'k_floor_keep', confidence: 0.9, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'k_floor_repair', confidence: 0.88, patterns: [/\bbest value\b/, /\bexisting floor is good\b/, /\bworth saving\b/] },
    { optionId: 'k_floor_full', confidence: 0.86, patterns: [/\bclean finish\b/, /\bfull renovation\b/, /\ball new\b/] },
  ],
  k_layout: [
    { optionId: 'k_lay_none', confidence: 0.95, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget|simple|fastest)\b/] },
    { optionId: 'k_lay_minor', confidence: 0.86, patterns: [/\bsmall change\b/, /\bminor update\b/] },
    { optionId: 'k_lay_major', confidence: 0.86, patterns: [/\bopen concept\b/, /\bmore space\b/, /\bbig change\b/] },
  ],
  b_shower: [
    { optionId: 'b_sh_keep', confidence: 0.88, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'b_sh_walkin', confidence: 0.92, patterns: [/\bwalk in\b/, /\bwalkin\b/, /\bno tub\b/, /\bremove tub\b/, /\bmodern\b/, /\bresale\b/, /\baccessibility\b/, /\bspa\b/] },
    { optionId: 'b_sh_combo', confidence: 0.86, patterns: [/\bfamily\b/, /\bkids\b/, /\bpractical\b/] },
  ],
  b_vanity: [
    { optionId: 'b_van_keep', confidence: 0.88, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'b_van_double', confidence: 0.9, patterns: [/\bresale\b/, /\btwo people\b/, /\bshared bathroom\b/] },
    { optionId: 'b_van_floating', confidence: 0.86, patterns: [/\bmodern\b/, /\bspa\b/, /\bclean\b/] },
  ],
  b_tile: [
    { optionId: 'b_tile_keep', confidence: 0.88, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget)\b/] },
    { optionId: 'b_tile_shower', confidence: 0.9, patterns: [/\bbest value\b/, /\bpractical\b/, /\bcontrol cost\b/] },
    { optionId: 'b_tile_full', confidence: 0.88, patterns: [/\bcomplete\b/, /\bfull renovation\b/, /\bpremium\b/] },
  ],
  b_toilet: [
    { optionId: 'b_toil_keep', confidence: 0.9, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget|newer|working well)\b/] },
    { optionId: 'b_toil_replace', confidence: 0.9, patterns: [/\bclean finish\b/, /\bcomplete\b/, /\ball new\b/] },
  ],
  b_plumbing: [
    { optionId: 'b_plumb_none', confidence: 0.95, patterns: [/\b(cheap|cheapest|affordable|save money|tight budget|simple|fastest)\b/] },
    { optionId: 'b_plumb_minor', confidence: 0.86, patterns: [/\bsmall move\b/, /\bsame wall\b/] },
    { optionId: 'b_plumb_major', confidence: 0.86, patterns: [/\bdifferent wall\b/, /\bbig change\b/, /\bnew layout\b/] },
  ],
  k_timeline: [
    { optionId: 'k_time_flexible', confidence: 0.9, patterns: [/\bbest price\b/, /\bbest availability\b/, /\bcontractor availability\b/, /\bnot urgent\b/] },
    { optionId: 'k_time_standard', confidence: 0.88, patterns: [/\bpractical\b/, /\bplanning time\b/, /\bnormal\b/] },
    { optionId: 'k_time_asap', confidence: 0.9, patterns: [/\bsoon\b/, /\bfastest\b/, /\burgent\b/] },
  ],
  b_timeline: [
    { optionId: 'b_time_flexible', confidence: 0.9, patterns: [/\bbest price\b/, /\bbest availability\b/, /\bcontractor availability\b/, /\bnot urgent\b/] },
    { optionId: 'b_time_standard', confidence: 0.88, patterns: [/\bpractical\b/, /\bplanning time\b/, /\bnormal\b/] },
    { optionId: 'b_time_asap', confidence: 0.9, patterns: [/\bsoon\b/, /\bfastest\b/, /\burgent\b/] },
  ],
  k_home: [
    { optionId: 'k_home_no', confidence: 0.88, patterns: [/\b(less|least)\s+disruption\b/, /\bsafer\b/, /\bfaster work\b/] },
    { optionId: 'k_home_partial', confidence: 0.86, patterns: [/\bsome flexibility\b/, /\bpart time\b/] },
    { optionId: 'k_home_yes', confidence: 0.86, patterns: [/\bstay home\b/, /\bneed to stay\b/] },
  ],
  b_home: [
    { optionId: 'b_home_no', confidence: 0.88, patterns: [/\b(less|least)\s+disruption\b/, /\bsafer\b/, /\bfaster work\b/] },
    { optionId: 'b_home_partial', confidence: 0.86, patterns: [/\bsome flexibility\b/, /\bpart time\b/] },
    { optionId: 'b_home_yes', confidence: 0.86, patterns: [/\bstay home\b/, /\bneed to stay\b/] },
  ],
};

const QUESTION_OPTION_PHRASES: Record<string, OptionPhraseRule[]> = {
  k_style: [
    { optionId: 'k_style_transitional', aliases: ['transitional', 'classic and modern', 'modern and classic', 'mix of modern and traditional'], patterns: [/\btransitional\b/, /\b(classic|traditional)\b.*\bmodern\b/, /\bmodern\b.*\b(classic|traditional)\b/, /\bmix\b.*\bmodern\b.*\btraditional\b/] },
    { optionId: 'k_style_modern', aliases: ['modern', 'contemporary', 'clean lines', 'minimal hardware'], patterns: [/\bmodern\b/, /\bcontemporary\b/, /\bclean lines\b/, /\bminimal\b/] },
    { optionId: 'k_style_traditional', aliases: ['traditional', 'classic', 'raised panel', 'ornate'], patterns: [/\btraditional\b/, /\bclassic\b/, /\braised panel\b/, /\bornate\b/] },
    { optionId: 'k_style_farmhouse', aliases: ['farmhouse', 'modern farmhouse', 'shaker', 'rustic', 'warm wood'], patterns: [/\bmodern farmhouse\b/, /\bfarmhouse\b/, /\bshaker\b/, /\brustic\b/, /\bwarm\b.*\bwood\b/] },
    { optionId: 'k_style_industrial', aliases: ['industrial', 'exposed materials', 'dark metal', 'black metal'], patterns: [/\bindustrial\b/, /\bexposed\b/, /\bdark\b.*\bmetal\b/, /\bblack\b.*\bmetal\b/] },
  ],
  b_style: [
    { optionId: 'b_style_transitional', aliases: ['transitional', 'classic and modern', 'modern and classic', 'mix of modern and traditional'], patterns: [/\btransitional\b/, /\b(classic|traditional)\b.*\bmodern\b/, /\bmodern\b.*\b(classic|traditional)\b/, /\bmix\b.*\bmodern\b.*\btraditional\b/] },
    { optionId: 'b_style_modern', aliases: ['modern', 'spa', 'clean lines', 'frameless glass', 'hotel spa'], patterns: [/\bmodern\b/, /\bspa\b/, /\bclean lines\b/, /\bframeless\b/, /\bhotel\b.*\bspa\b/] },
    { optionId: 'b_style_traditional', aliases: ['traditional', 'classic', 'ornate', 'wainscoting'], patterns: [/\btraditional\b/, /\bclassic\b/, /\bornate\b/, /\bwainscot/] },
    { optionId: 'b_style_farmhouse', aliases: ['farmhouse', 'modern farmhouse', 'shiplap', 'freestanding tub', 'matte black'], patterns: [/\bmodern farmhouse\b/, /\bfarmhouse\b/, /\bshiplap\b/, /\bfree\s?standing\b/, /\bmatte\b.*\bblack\b/] },
    { optionId: 'b_style_industrial', aliases: ['industrial', 'concrete', 'dark tones', 'exposed pipe'], patterns: [/\bindustrial\b/, /\bconcrete\b/, /\bdark\b.*\btone\b/, /\bexposed\b.*\bpipe\b/] },
  ],
  k_tier: [
    { optionId: 'k_tier_budget', aliases: ['budget', 'affordable', 'basic', 'builder grade', 'stock cabinets', 'laminate'], patterns: [/\bbudget\b/, /\b(cheap|cheapest|affordable|low cost)\b/, /\bbasic\b/, /\bbuilder grade\b/, /\bstock\b/, /\blaminate\b/] },
    { optionId: 'k_tier_mid', aliases: ['mid range', 'middle range', 'good quality', 'semi custom', 'not too cheap', 'not too expensive'], patterns: [/\bmid range\b/, /\bmiddle range\b/, /\bgood quality\b/, /\bsemi custom\b/, /\bnot too cheap\b/, /\bnot too expensive\b/, /\bmiddle of the road\b/] },
    { optionId: 'k_tier_luxury', aliases: ['luxury', 'premium', 'high end', 'custom', 'marble', 'quartzite'], patterns: [/\bluxury\b/, /\bpremium\b/, /\bhigh end\b/, /\btop of the line\b/, /\bcustom\b/, /\bquartzite\b/, /\bmarble\b/] },
  ],
  b_tier: [
    { optionId: 'b_tier_budget', aliases: ['budget', 'affordable', 'basic', 'builder grade', 'functional finish'], patterns: [/\bbudget\b/, /\b(cheap|cheapest|affordable|low cost)\b/, /\bbasic\b/, /\bbuilder grade\b/, /\bfunctional\b/] },
    { optionId: 'b_tier_mid', aliases: ['mid range', 'middle range', 'good quality', 'quality porcelain', 'semi custom'], patterns: [/\bmid range\b/, /\bmiddle range\b/, /\bgood quality\b/, /\bporcelain\b/, /\bsemi custom\b/, /\bnot too expensive\b/] },
    { optionId: 'b_tier_luxury', aliases: ['luxury', 'premium', 'high end', 'natural stone', 'custom vanity'], patterns: [/\bluxury\b/, /\bpremium\b/, /\bhigh end\b/, /\bnatural stone\b/, /\bcustom\b/] },
  ],
  k_cabinets: [
    { optionId: 'k_cab_full', aliases: ['full replacement', 'replace cabinets', 'new cabinets', 'rip out cabinets'], patterns: [/\bfull replacement\b/, /\breplace\b.*\bcabinet/, /\bnew\b.*\bcabinet/, /\brip out\b.*\bcabinet/, /\bfrom scratch\b/] },
    { optionId: 'k_cab_reface', aliases: ['reface', 'refacing', 'new doors', 'keep boxes', 'replace cabinet doors'], patterns: [/\brefac/, /\bnew\b.*\bdoors\b/, /\breplace\b.*\bdoors\b/, /\bkeep\b.*\bbox/, /\bexisting\b.*\bbox/] },
    { optionId: 'k_cab_paint', aliases: ['paint cabinets', 'refinish cabinets', 'repaint', 'just paint'], patterns: [/\bpaint\b.*\bcabinet/, /\bcabinet\b.*\bpaint/, /\brefinish\b.*\bcabinet/, /\brepaint\b/, /\bjust paint\b/] },
    { optionId: 'k_cab_keep', aliases: ['keep cabinets', 'no cabinet work', 'leave cabinets', 'as is'], patterns: [/\bkeep\b.*\bcabinet/, /\bleave\b.*\bcabinet/, /\bno\b.*\bcabinet\b.*\bwork\b/, /\bas is\b/, /\bdon t\b.*\bcabinet/] },
  ],
  k_countertops: [
    { optionId: 'k_ct_quartz', aliases: ['quartz', 'engineered stone', 'low maintenance'], patterns: [/\bquartz\b/, /\bengineered\b.*\bstone\b/, /\blow maintenance\b/] },
    { optionId: 'k_ct_granite', aliases: ['granite', 'natural stone', 'unique patterns'], patterns: [/\bgranite\b/, /\bnatural stone\b/, /\bunique\b.*\bpattern/] },
    { optionId: 'k_ct_marble', aliases: ['marble', 'quartzite', 'premium stone'], patterns: [/\bmarble\b/, /\bquartzite\b/, /\bpremium\b.*\bstone\b/] },
    { optionId: 'k_ct_porcelain', aliases: ['porcelain', 'porcelain slab', 'large format'], patterns: [/\bporcelain\b/, /\blarge format\b/] },
    { optionId: 'k_ct_keep', aliases: ['keep countertops', 'existing countertops', 'leave counters'], patterns: [/\bkeep\b.*\bcounter/, /\bexisting\b.*\bcounter/, /\bleave\b.*\bcounter/, /\bno\b.*\bcounter/] },
  ],
  k_appliances: [
    { optionId: 'k_app_some', aliases: ['some appliances', 'a few appliances', 'not all appliances'], patterns: [/\b(some|a few|couple)\b.*\bappliance/, /\bnot all\b.*\bappliance/] },
    { optionId: 'k_app_full', aliases: ['full appliance suite', 'all appliances', 'fridge stove dishwasher range hood'], patterns: [/\bfull suite\b/, /\ball\b.*\bappliance/, /\beverything\b.*\bappliance/, /\bfridge\b.*\bstove\b.*\bdishwasher\b/] },
    { optionId: 'k_app_none', aliases: ['keep appliances', 'no appliances', 'existing appliances'], patterns: [/\b(no|none)\b.*\bappliance/, /\bkeep\b.*\bappliance/, /\bexisting\b.*\bappliance/, /\bcurrent\b.*\bappliance/] },
  ],
  k_flooring: [
    { optionId: 'k_floor_full', aliases: ['replace floor', 'new flooring', 'full floor replacement'], patterns: [/\breplace\b.*\bfloor/, /\bnew\b.*\bfloor/, /\bfull\b.*\bfloor/] },
    { optionId: 'k_floor_repair', aliases: ['repair floor', 'refinish floor', 'sand existing floor'], patterns: [/\brepair\b.*\bfloor/, /\brefinish\b.*\bfloor/, /\bsand\b.*\bfloor/] },
    { optionId: 'k_floor_keep', aliases: ['keep floor', 'existing flooring', 'leave floor'], patterns: [/\bkeep\b.*\bfloor/, /\bexisting\b.*\bfloor/, /\bleave\b.*\bfloor/, /\bno\b.*\bfloor/] },
  ],
  k_layout: [
    { optionId: 'k_lay_none', aliases: ['same layout', 'no layout changes', 'cosmetic only', 'do not move anything'], patterns: [/\bsame layout\b/, /\bno\b.*\blayout/, /\bcosmetic\b.*\bonly\b/, /\bdon t\b.*\b(move|relocate|change)/, /\bdo not\b.*\b(move|relocate|change)/] },
    { optionId: 'k_lay_minor', aliases: ['minor layout change', 'move a window', 'move a door', 'small electrical change'], patterns: [/\bminor\b/, /\bmove\b.*\b(window|door)\b/, /\breposition\b.*\b(window|door)\b/, /\bsmall\b.*\belectrical\b/] },
    { optionId: 'k_lay_major', aliases: ['major layout change', 'move walls', 'relocate plumbing', 'open up space'], patterns: [/\bmajor\b/, /\bmove\b.*\bwall/, /\brelocat\w*\b.*\bplumb/, /\bopen up\b/] },
  ],
  b_shower: [
    { optionId: 'b_sh_walkin', aliases: ['walk in shower', 'shower only', 'no tub', 'remove tub'], patterns: [/\bwalk in\b/, /\bwalkin\b/, /\bshower only\b/, /\bno tub\b/, /\bremove\b.*\btub\b/] },
    { optionId: 'b_sh_combo', aliases: ['tub shower combo', 'shower tub combo', 'alcove tub'], patterns: [/\btub\b.*\bshower\b.*\bcombo\b/, /\bshower\b.*\btub\b.*\bcombo\b/, /\balcove\b/] },
    { optionId: 'b_sh_both', aliases: ['separate tub and shower', 'soaker tub', 'separate shower'], patterns: [/\bseparate\b.*\btub\b.*\bshower\b/, /\bsoaker\b/, /\bseparate shower\b/] },
    { optionId: 'b_sh_keep', aliases: ['keep shower', 'existing shower tub', 'same shower layout'], patterns: [/\bkeep\b.*\b(shower|tub)\b/, /\bexisting\b.*\b(shower|tub)\b/, /\bsame\b.*\b(shower|tub)\b/] },
  ],
  b_vanity: [
    { optionId: 'b_van_double', aliases: ['double vanity', 'two sinks', 'double sink'], patterns: [/\bdouble\b.*\bvanity\b/, /\btwo\b.*\bsinks?\b/, /\bdouble\b.*\bsinks?\b/] },
    { optionId: 'b_van_single', aliases: ['single vanity', 'one sink', 'single sink'], patterns: [/\bsingle\b.*\bvanity\b/, /\bone\b.*\bsink\b/, /\bsingle\b.*\bsink\b/] },
    { optionId: 'b_van_floating', aliases: ['floating vanity', 'wall mount vanity', 'wall mounted sink'], patterns: [/\bfloating\b/, /\bwall mount/, /\bwall mounted\b/] },
    { optionId: 'b_van_keep', aliases: ['keep vanity', 'refinish vanity', 'existing vanity'], patterns: [/\bkeep\b.*\bvanity\b/, /\brefinish\b.*\bvanity\b/, /\bexisting\b.*\bvanity\b/] },
  ],
  b_tile: [
    { optionId: 'b_tile_full', aliases: ['full tile', 'all tile', 'tile everything', 'floor and shower walls'], patterns: [/\bfull\b.*\btile\b/, /\ball\b.*\btile\b/, /\btile\b.*\beverything\b/, /\bfloor\b.*\bshower\b.*\bwall\b/] },
    { optionId: 'b_tile_shower', aliases: ['shower tile only', 'tub area only', 'only the shower'], patterns: [/\bshower\b.*\bonly\b/, /\bonly\b.*\bshower\b/, /\btub area\b/, /\bshower area\b/] },
    { optionId: 'b_tile_floor', aliases: ['floor tile only', 'only the floor'], patterns: [/\bfloor\b.*\bonly\b/, /\bonly\b.*\bfloor\b/] },
    { optionId: 'b_tile_keep', aliases: ['keep tile', 'existing tile', 'no tile work'], patterns: [/\bkeep\b.*\btile\b/, /\bexisting\b.*\btile\b/, /\bno\b.*\btile\b/] },
  ],
  b_toilet: [
    { optionId: 'b_toil_replace', aliases: ['replace toilet', 'new toilet'], patterns: [/\breplace\b.*\btoilet\b/, /\bnew\b.*\btoilet\b/] },
    { optionId: 'b_toil_keep', aliases: ['keep toilet', 'existing toilet'], patterns: [/\bkeep\b.*\btoilet\b/, /\bexisting\b.*\btoilet\b/, /\bno\b.*\btoilet\b/] },
  ],
  b_plumbing: [
    { optionId: 'b_plumb_none', aliases: ['no plumbing moves', 'same plumbing location', 'do not move plumbing'], patterns: [/\bno\b.*\bplumb/, /\bsame\b.*\b(plumbing location|fixture location)/, /\bdon t\b.*\bmove\b.*\bplumb/, /\bdo not\b.*\bmove\b.*\bplumb/] },
    { optionId: 'b_plumb_minor', aliases: ['minor plumbing move', 'move plumbing a foot', 'same wall'], patterns: [/\bminor\b/, /\bsame wall\b/, /\b(a|one|two|1|2)\b.*\b(foot|feet)\b/, /\bsmall\b.*\bplumb/] },
    { optionId: 'b_plumb_major', aliases: ['major plumbing move', 'different wall', 'drain relocation'], patterns: [/\bmajor\b/, /\bdifferent wall\b/, /\bdrain\b.*\brelocat/, /\bmove\b.*\bplumb\b.*\bwall\b/] },
  ],
  k_timeline: [
    { optionId: 'k_time_asap', aliases: ['as soon as possible', 'right away', 'next few weeks', 'next month'], patterns: [/\basap\b/, /\bas soon as possible\b/, /\bright away\b/, /\bimmediately\b/, /\bnext few weeks\b/, /\bnext month\b/, /\bsoon\b/] },
    { optionId: 'k_time_standard', aliases: ['three to six months', 'in a few months', 'standard timeline'], patterns: [/\b3\s*6 months\b/, /\bthree\b.*\bsix\b.*\bmonths\b/, /\bfew months\b/, /\bstandard\b/] },
    { optionId: 'k_time_flexible', aliases: ['flexible', 'no rush', 'six months out', 'later'], patterns: [/\bflexible\b/, /\bno rush\b/, /\bnot in a rush\b/, /\b6 months\b/, /\bsix months\b/, /\blater\b/] },
  ],
  b_timeline: [
    { optionId: 'b_time_asap', aliases: ['as soon as possible', 'right away', 'next few weeks', 'next month'], patterns: [/\basap\b/, /\bas soon as possible\b/, /\bright away\b/, /\bimmediately\b/, /\bnext few weeks\b/, /\bnext month\b/, /\bsoon\b/] },
    { optionId: 'b_time_standard', aliases: ['three to six months', 'in a few months', 'standard timeline'], patterns: [/\b3\s*6 months\b/, /\bthree\b.*\bsix\b.*\bmonths\b/, /\bfew months\b/, /\bstandard\b/] },
    { optionId: 'b_time_flexible', aliases: ['flexible', 'no rush', 'six months out', 'later'], patterns: [/\bflexible\b/, /\bno rush\b/, /\bnot in a rush\b/, /\b6 months\b/, /\bsix months\b/, /\blater\b/] },
  ],
  k_home: [
    { optionId: 'k_home_yes', aliases: ['staying home', 'living at home', 'yes I will be home'], patterns: [/\b(stay|staying|live|living)\b.*\b(home|house|there|here)\b/, /\byes\b.*\bhome\b/] },
    { optionId: 'k_home_partial', aliases: ['home some days', 'partially home', 'sometimes home'], patterns: [/\b(partially|part time|some days|sometimes)\b.*\bhome\b/, /\bhome\b.*\b(some days|sometimes)\b/] },
    { optionId: 'k_home_no', aliases: ['moving out', 'alternative accommodation', 'somewhere else', 'not living there'], patterns: [/\bmove out\b/, /\bmoving out\b/, /\balternative accommodation\b/, /\bsomewhere else\b/, /\bnot\b.*\b(living|staying)\b/] },
  ],
  b_home: [
    { optionId: 'b_home_yes', aliases: ['staying home', 'living at home', 'yes I will be home'], patterns: [/\b(stay|staying|live|living)\b.*\b(home|house|there|here)\b/, /\byes\b.*\bhome\b/] },
    { optionId: 'b_home_partial', aliases: ['home some days', 'partially home', 'sometimes home'], patterns: [/\b(partially|part time|some days|sometimes)\b.*\bhome\b/, /\bhome\b.*\b(some days|sometimes)\b/] },
    { optionId: 'b_home_no', aliases: ['moving out', 'alternative accommodation', 'somewhere else', 'not living there'], patterns: [/\bmove out\b/, /\bmoving out\b/, /\balternative accommodation\b/, /\bsomewhere else\b/, /\bnot\b.*\b(living|staying)\b/] },
  ],
};

function optionVoiceAliases(question: QuestionnaireQuestion) {
  const optionIds = new Set(question.options.map((option) => option.id));
  return (QUESTION_OPTION_PHRASES[question.id] ?? [])
    .filter((rule) => optionIds.has(rule.optionId))
    .flatMap((rule) => rule.aliases);
}

function optionExplanationPromptRequested(value: string) {
  if (/\bwhat is\s+(the\s+)?(best|cheapest|lowest|most|least)\b/.test(value)) return false;
  return /\b(what is|what are|what s|whats|what about|how about|tell me about|explain|describe|more about|learn about|what does|why|compare|difference between|which is better|which one is better|which should i choose|which would you choose|should i choose)\b/.test(value)
    || /\b(is|are)\b.*\b(good|better|best|worth it|durable|expensive|cheap|easy to clean|low maintenance)\b/.test(value)
    || /\bbetter than\b/.test(value)
    || /\bor\b/.test(value);
}

function optionExplanationTerms(question: QuestionnaireQuestion, optionId: string, label: string) {
  const phraseRule = (QUESTION_OPTION_PHRASES[question.id] ?? []).find((rule) => rule.optionId === optionId);
  return [
    label.split('—')[0].trim(),
    ...labelKeywords(label),
    ...(phraseRule?.aliases ?? []),
  ];
}

export function optionExplanationForTranscript(
  transcript: string,
  question: QuestionnaireQuestion,
): VoiceOptionExplanation | null {
  const normalizedTranscript = normalize(transcript);
  if (!optionExplanationPromptRequested(normalizedTranscript)) return null;

  const positional = optionPositionMatch(normalizedTranscript, question);
  if (positional) {
    const option = question.options.find((item) => item.id === positional.optionId);
    if (!option) return null;
    const [label, detail = ''] = option.label.split('—').map((part) => part.trim());
    return { optionId: option.id, label, detail };
  }

  const matches = question.options
    .map<VoiceOptionExplanation | null>((option) => {
      const [label, detail = ''] = option.label.split('—').map((part) => part.trim());
      const terms = optionExplanationTerms(question, option.id, option.label)
        .map(normalize)
        .filter((term) => term.length > 2);
      const matched = terms.some((term) => normalizedTranscript.includes(term));
      return matched ? { optionId: option.id, label, detail } : null;
    })
    .filter((match): match is VoiceOptionExplanation => !!match);

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const recommendedMatch = recommendedComparisonMatch(question, matches);
    const labels = matches.map((match) => match.label).join(' and ');
    const detail = matches
      .map((match) => (
        match.detail
          ? `${match.label} means ${match.detail}.`
          : `${match.label} is one of the available options.`
      ))
      .join(' ');
    return {
      optionId: null,
      recommendedOptionId: recommendedMatch?.optionId ?? null,
      recommendedOptionLabel: recommendedMatch?.label ?? null,
      label: labels,
      detail,
    };
  }

  return null;
}

function rejectedOptionIdsForTranscript(value: string, question: QuestionnaireQuestion) {
  const rejected = new Set<string>();

  question.options.forEach((option) => {
    if (question.id === 'b_shower' && option.id === 'b_sh_walkin' && /\b(no tub|remove tub)\b/.test(value)) {
      return;
    }

    const phraseRule = (QUESTION_OPTION_PHRASES[question.id] ?? []).find((rule) => rule.optionId === option.id);
    const terms = [
      option.label.split('—')[0].trim(),
      ...(phraseRule?.aliases ?? []),
    ].map(normalize).filter((term) => term.length > 2);

    if (terms.some((term) => {
      const escaped = escapeRegExp(term);
      return new RegExp(`\\b(?:not|no|nope|without|except|excluding|exclude|anything but|everything but|don t want|dont want|do not want|don t like|dont like|do not like|not interested in)\\s+(?:the\\s+)?${escaped}\\b`).test(value)
        || new RegExp(`\\b${escaped}\\b\\s+(?:is\\s+)?(?:out|no|not)\\b`).test(value);
    })) {
      rejected.add(option.id);
    }
  });

  return rejected;
}

function directNaturalOptionMatch(value: string, question: QuestionnaireQuestion): VoiceOptionMatch | null {
  const optionIds = new Set(question.options.map((option) => option.id));
  const rejectedOptionIds = rejectedOptionIdsForTranscript(value, question);
  const choose = (optionId: string, confidence = 0.96) => (
    optionIds.has(optionId) && !rejectedOptionIds.has(optionId) ? { optionId, confidence, reason: 'keywords' as const } : null
  );

  const recommendedOption = recommendedOptionForQuestion(question);
  if (recommendedOption && transcriptAcceptsRecommendation(value)) {
    return choose(recommendedOption.id, 0.96);
  }

  const preferenceRules = PREFERENCE_OPTION_RULES[question.id] ?? [];
  for (const rule of preferenceRules) {
    if (!optionIds.has(rule.optionId)) continue;
    if (rule.patterns.some((pattern) => pattern.test(value))) {
      return choose(rule.optionId, rule.confidence);
    }
  }

  const phraseRules = QUESTION_OPTION_PHRASES[question.id] ?? [];
  let bestRule: { optionId: string; hits: number } | null = null;
  let tiedDifferentOption = false;
  for (const rule of phraseRules) {
    if (!optionIds.has(rule.optionId) || rejectedOptionIds.has(rule.optionId)) continue;
    const hits = rule.patterns.filter((pattern) => pattern.test(value)).length;
    if (hits > 0 && (!bestRule || hits > bestRule.hits)) {
      bestRule = { optionId: rule.optionId, hits };
      tiedDifferentOption = false;
    } else if (hits > 0 && bestRule && hits === bestRule.hits && rule.optionId !== bestRule.optionId) {
      tiedDifferentOption = true;
    }
  }

  if (bestRule) {
    return choose(bestRule.optionId, tiedDifferentOption ? 0.68 : 0.96);
  }

  return null;
}

export function analyzeTranscriptForQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): VoiceOptionMatch | null {
  const baseTranscript = normalize(transcript);
  if (optionExplanationForTranscript(baseTranscript, question)) return null;

  const directMatch = directNaturalOptionMatch(baseTranscript, question);
  if (directMatch) return directMatch;

  const normalizedTranscript = expandNaturalAnswerPhrases(baseTranscript);
  if (!normalizedTranscript) return null;

  const positional = optionPositionMatch(normalizedTranscript, question);
  if (positional) return positional;

  const transcriptTokens = tokenList(normalizedTranscript);
  const candidates: VoiceOptionMatch[] = [];
  const rejectedOptionIds = rejectedOptionIdsForTranscript(normalizedTranscript, question);

  for (const option of question.options) {
    if (rejectedOptionIds.has(option.id)) continue;

    const normalizedLabel = normalize(option.label);
    const primaryLabel = normalize(option.label.split('—')[0]);
    if (normalizedTranscript === normalizedLabel || normalizedTranscript === primaryLabel) {
      return { optionId: option.id, confidence: 0.98, reason: 'exact' };
    }

    if (normalizedTranscript.includes(primaryLabel) && primaryLabel.length > 2) {
      const confidence = primaryLabel.split(' ').length > 1 ? 0.94 : 0.88;
      candidates.push({ optionId: option.id, confidence, reason: 'primary' });
      continue;
    }

    const keywords = labelKeywords(option.label);
    if (keywords.length === 0) continue;

    const matchedKeywords = keywords.filter((keyword) => transcriptHasKeyword(keyword, transcriptTokens, normalizedTranscript));
    const primaryTokens = tokenList(primaryLabel);
    const primaryHits = primaryTokens.filter((token) => transcriptHasKeyword(token, transcriptTokens, normalizedTranscript)).length;
    const score = (matchedKeywords.length / keywords.length) + (primaryHits / Math.max(1, primaryTokens.length)) * 0.45;

    if (matchedKeywords.length === 0 && primaryHits === 0) continue;

    const confidence = Math.min(0.9, score);
    candidates.push({ optionId: option.id, confidence, reason: 'keywords' });
  }

  const [best, runnerUp] = candidates.sort((a, b) => b.confidence - a.confidence);
  if (!best || best.confidence < 0.34) return null;

  if (runnerUp && best.confidence - runnerUp.confidence <= 0.12) {
    return { ...best, confidence: Math.min(best.confidence, 0.68) };
  }

  return best;
}

export function transcriptConfirmsSelection(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  if (hasRejectionCue(normalizedTranscript)) return false;
  return /\b(yes|yeah|yep|yup|correct|confirm|right|that one|sounds good|go ahead|select it|pick it|exactly|looks right)\b/.test(normalizedTranscript);
}

export function transcriptRejectsSelection(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return hasRejectionCue(normalizedTranscript);
}

function hasRejectionCue(normalizedTranscript: string) {
  return /\b(no|nope|wrong|try again|not that|not right|different|cancel)\b/.test(normalizedTranscript);
}

export function transcriptRequestsDecisionHelp(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  if (transcriptAcceptsRecommendation(normalizedTranscript)) return false;
  return /\b(help me choose|help me decide|not sure|unsure|don t know|dont know|do not know|what do you recommend|recommend|explain|difference|compare)\b/.test(normalizedTranscript);
}

export function transcriptAcceptsRecommendation(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(go with|choose|pick|select|use|take)\b.*\b(your|the|that)?\s*(recommendation|recommended|default|suggestion)\b/.test(normalizedTranscript)
    || /\b(whatever|what ever)\s+you\s+(recommend|suggest|think)\b/.test(normalizedTranscript)
    || /\b(you decide|surprise me|dealer s choice|dealers choice)\b/.test(normalizedTranscript)
    || /\byour\s+(recommendation|suggestion)\s+is\s+fine\b/.test(normalizedTranscript)
    || /\bthat\s+recommendation\s+(works|sounds good|is fine)\b/.test(normalizedTranscript);
}

export function transcriptAcceptsSuggestionFollowUp(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  if (hasRejectionCue(normalizedTranscript)) return false;
  return /\b(that|this)\s+(sounds good|works|is fine|one is fine)\b/.test(normalizedTranscript)
    || /\b(sounds good|works for me|that works|let s do that|lets do that|do that|go ahead|yes that one|that one)\b/.test(normalizedTranscript)
    || /^(yes|yeah|yep|yup|okay|ok|sure|perfect|great|fine|correct|exactly)$/.test(normalizedTranscript);
}

export function transcriptRequestsOptionsRepeat(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(repeat|again|say that again|read them again|options again|what are the options|list the options)\b/.test(normalizedTranscript);
}

export function transcriptRequestsPreviousQuestion(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(go back|previous question|last question|back one|change my last answer|change previous answer|change that answer|edit last answer)\b/.test(normalizedTranscript);
}

export function transcriptRequestsVoiceStop(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(stop|pause|cancel|quit|exit|manual|tap manually|voice cancelled)\b/.test(normalizedTranscript);
}

export function extractCorrectedAnswerTranscript(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  const correctionPatterns = [
    /\b(?:not|not that|wrong)\s+.+?\b(?:but|instead|rather)\s+(?:the\s+)?(.+)$/,
    /\b(?:no|nope)\s+not\s+\w+\s+(?:it\s+is\s+|its\s+|it s\s+)?(?:the\s+)?(.+)$/,
    /\b(?:i\s+)?(?:mean|meant|wanted|want|choose|pick|select|take|use)\s+(?:the\s+)?(.+)$/,
    /\b(?:actually|instead|rather)\s+(?:i\s+)?(?:want|choose|pick|select|take|use)?\s*(?:the\s+)?(.+)$/,
    /\b(?:not|not that|wrong)\s+.+?\b(?:but|it is|its|it's)\s+(?:the\s+)?(.+)$/,
    /\b(?:no|nope|wrong)\s+(?:actually\s+)?(?:it\s+is\s+|its\s+|it s\s+)?(?:the\s+)?(.+)$/,
  ];

  for (const pattern of correctionPatterns) {
    const match = normalizedTranscript.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) return candidate;
  }

  return normalizedTranscript
    .replace(/^(no|nope|wrong|not that one|not that)\s+/, '')
    .trim();
}

export function buildVoiceContextTerms(question: QuestionnaireQuestion) {
  const terms = new Set<string>();
  question.options.forEach((option, index) => {
    terms.add(`${index + 1}`);
    terms.add(`option ${index + 1}`);
    terms.add(option.label);
    terms.add(option.label.split('—')[0].trim());
    labelKeywords(option.label).forEach((keyword) => terms.add(keyword));
  });
  optionVoiceAliases(question).forEach((term) => terms.add(term));
  [
    'repeat options',
    'what are the options',
    'help me choose',
    'not sure',
    'what do you recommend',
    'what is option 1',
    'tell me about option 1',
    'explain option 1',
    'go with your recommendation',
    'choose your recommendation',
    'whatever you recommend',
    'that sounds good',
    'lets do that',
    'yes',
    'okay',
    'sure',
    'perfect',
    'you decide',
    'surprise me',
    'go back',
    'previous question',
    'change my last answer',
    'stop',
  ].forEach((term) => terms.add(term));
  return Array.from(terms).filter((term) => term.length > 0);
}

export function matchTranscriptToQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): string | null {
  return analyzeTranscriptForQuestionOption(transcript, question)?.optionId ?? null;
}
