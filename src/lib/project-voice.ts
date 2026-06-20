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
  const options = question.options.map((option, index) => `${index + 1}. ${option.label}`).join('. ');
  await speakProjectPrompt(`${question.text}. Your options are: ${options}.`);
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
  return shortest >= 4 && (token.startsWith(keyword) || keyword.startsWith(token));
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

function directNaturalOptionMatch(value: string, question: QuestionnaireQuestion): VoiceOptionMatch | null {
  const optionIds = new Set(question.options.map((option) => option.id));
  const choose = (optionId: string) => (
    optionIds.has(optionId) ? { optionId, confidence: 0.96, reason: 'keywords' as const } : null
  );

  if (question.id === 'k_appliances') {
    if (/\b(some|a few|couple)\b/.test(value) || /\bnot all\b/.test(value)) return choose('k_app_some');
    if (/\b(full suite|all appliances|everything)\b/.test(value)) return choose('k_app_full');
    if (/\b(no|none|keep|keeping|existing|current)\b/.test(value)) return choose('k_app_none');
  }

  if (question.id === 'b_vanity') {
    if (/\b(double sink|two sinks|double vanity)\b/.test(value)) return choose('b_van_double');
    if (/\b(single sink|one sink|single vanity)\b/.test(value)) return choose('b_van_single');
    if (/\b(floating|wall mount|wall mounted)\b/.test(value)) return choose('b_van_floating');
    if (/\b(keep|keeping|existing|current|refinish|as is)\b/.test(value)) return choose('b_van_keep');
  }

  if (question.id === 'b_tile') {
    if (/\b(floor only|only the floor)\b/.test(value)) return choose('b_tile_floor');
    if (/\b(shower only|only the shower|shower area|tub area)\b/.test(value)) return choose('b_tile_shower');
    if (/\b(full tile|all tile|everything tiled)\b/.test(value)) return choose('b_tile_full');
    if (/\b(keep|keeping|existing|current|as is)\b/.test(value)) return choose('b_tile_keep');
  }

  return null;
}

export function analyzeTranscriptForQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): VoiceOptionMatch | null {
  const baseTranscript = normalize(transcript);
  const directMatch = directNaturalOptionMatch(baseTranscript, question);
  if (directMatch) return directMatch;

  const normalizedTranscript = expandNaturalAnswerPhrases(baseTranscript);
  if (!normalizedTranscript) return null;

  const positional = optionPositionMatch(normalizedTranscript, question);
  if (positional) return positional;

  const transcriptTokens = tokenList(normalizedTranscript);
  let best: VoiceOptionMatch | null = null;

  for (const option of question.options) {
    const normalizedLabel = normalize(option.label);
    const primaryLabel = normalize(option.label.split('—')[0]);
    if (normalizedTranscript === normalizedLabel || normalizedTranscript === primaryLabel) {
      return { optionId: option.id, confidence: 0.98, reason: 'exact' };
    }

    if (normalizedTranscript.includes(primaryLabel) && primaryLabel.length > 2) {
      const confidence = primaryLabel.split(' ').length > 1 ? 0.94 : 0.88;
      const candidate = { optionId: option.id, confidence, reason: 'primary' as const };
      if (!best || candidate.confidence > best.confidence) best = candidate;
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
    if (!best || confidence > best.confidence) {
      best = { optionId: option.id, confidence, reason: 'keywords' };
    }
  }

  return best && best.confidence >= 0.34 ? best : null;
}

export function transcriptConfirmsSelection(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(yes|yeah|yep|correct|confirm|right|that one|sounds good|go ahead|select it|pick it)\b/.test(normalizedTranscript);
}

export function transcriptRejectsSelection(transcript: string) {
  const normalizedTranscript = normalize(transcript);
  return /\b(no|nope|wrong|try again|not that|different|cancel)\b/.test(normalizedTranscript);
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
    /\b(?:i\s+)?(?:mean|meant|wanted|want|choose|pick|select|take|use)\s+(?:the\s+)?(.+)$/,
    /\b(?:actually|instead|rather)\s+(?:i\s+)?(?:want|choose|pick|select|take|use)?\s*(?:the\s+)?(.+)$/,
    /\b(?:not|not that|wrong)\s+.+?\b(?:but|it is|its|it's)\s+(?:the\s+)?(.+)$/,
  ];

  for (const pattern of correctionPatterns) {
    const match = normalizedTranscript.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) return candidate;
  }

  return normalizedTranscript;
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
  ['repeat options', 'what are the options', 'go back', 'previous question', 'change my last answer', 'stop'].forEach((term) => terms.add(term));
  return Array.from(terms).filter((term) => term.length > 0);
}

export function matchTranscriptToQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): string | null {
  return analyzeTranscriptForQuestionOption(transcript, question)?.optionId ?? null;
}
