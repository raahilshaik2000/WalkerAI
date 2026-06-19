import { NativeModules, Platform } from 'react-native';
import type { QuestionnaireQuestion } from '@/types/database.types';

type WalkerVoiceAssistantModule = {
  requestPermissions: () => Promise<{ speech: boolean; microphone: boolean }>;
  speak: (text: string) => Promise<{ spoken: boolean }>;
  stopSpeaking: () => Promise<{ stopped: boolean }>;
  listenOnce: (locale: string, durationSeconds: number, contextualStrings: string[]) => Promise<{ transcript: string }>;
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
  return result.transcript.trim();
}

export async function stopProjectVoice() {
  if (nativeVoice?.stopSpeaking) {
    await nativeVoice.stopSpeaking();
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function analyzeTranscriptForQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): VoiceOptionMatch | null {
  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript) return null;

  const positional = optionPositionMatch(normalizedTranscript, question);
  if (positional) return positional;

  const transcriptTokens = new Set(tokenList(normalizedTranscript));
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

    const matchedKeywords = keywords.filter((keyword) => transcriptTokens.has(keyword) || normalizedTranscript.includes(keyword));
    const primaryTokens = tokenList(primaryLabel);
    const primaryHits = primaryTokens.filter((token) => transcriptTokens.has(token) || normalizedTranscript.includes(token)).length;
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

export function buildVoiceContextTerms(question: QuestionnaireQuestion) {
  const terms = new Set<string>();
  question.options.forEach((option, index) => {
    terms.add(`${index + 1}`);
    terms.add(`option ${index + 1}`);
    terms.add(option.label);
    terms.add(option.label.split('—')[0].trim());
    labelKeywords(option.label).forEach((keyword) => terms.add(keyword));
  });
  return Array.from(terms).filter((term) => term.length > 0);
}

export function matchTranscriptToQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): string | null {
  return analyzeTranscriptForQuestionOption(transcript, question)?.optionId ?? null;
}
