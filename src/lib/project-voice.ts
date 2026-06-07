import { NativeModules, Platform } from 'react-native';
import type { QuestionnaireQuestion } from '@/types/database.types';

type WalkerVoiceAssistantModule = {
  requestPermissions: () => Promise<{ speech: boolean; microphone: boolean }>;
  speak: (text: string) => Promise<{ spoken: boolean }>;
  stopSpeaking: () => Promise<{ stopped: boolean }>;
  listenOnce: (locale: string, durationSeconds: number) => Promise<{ transcript: string }>;
};

const nativeVoice = NativeModules.WalkerVoiceAssistant as WalkerVoiceAssistantModule | undefined;

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

export async function listenForProjectAnswer(durationSeconds = 7) {
  if (!nativeVoice?.listenOnce) {
    throw new Error('Voice answers are not available on this device.');
  }
  const result = await nativeVoice.listenOnce('en-CA', durationSeconds);
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
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelKeywords(label: string) {
  const beforeDash = label.split('—')[0];
  const seen = new Set<string>();
  return normalize(`${beforeDash} ${label}`)
    .split(' ')
    .filter((token) => {
      const keep = token.length > 2 && !seen.has(token);
      seen.add(token);
      return keep;
    });
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
};

export function matchTranscriptToQuestionOption(
  transcript: string,
  question: QuestionnaireQuestion,
): string | null {
  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript) return null;

  const numericMatch = normalizedTranscript.match(/\b(?:option|number|choice)\s*(\d+)\b/) ?? normalizedTranscript.match(/^(\d+)$/);
  if (numericMatch) {
    const index = Number(numericMatch[1]) - 1;
    if (question.options[index]) return question.options[index].id;
  }

  const spokenOptionMatch = normalizedTranscript.match(/\b(?:option|number|choice)\s+([a-z]+)\b/)
    ?? normalizedTranscript.match(/^([a-z]+)$/)
    ?? normalizedTranscript.match(/^the\s+([a-z]+)\s+(?:one|option|choice)$/);
  if (spokenOptionMatch) {
    const number = NUMBER_WORDS[spokenOptionMatch[1]];
    if (number && question.options[number - 1]) return question.options[number - 1].id;
  }

  let best: { id: string; score: number } | null = null;
  for (const option of question.options) {
    const optionLabel = normalize(option.label);
    if (normalizedTranscript.includes(optionLabel) || optionLabel.includes(normalizedTranscript)) {
      return option.id;
    }

    const primaryLabelTokens = normalize(option.label.split('—')[0])
      .split(' ')
      .filter((token) => token.length > 2);
    if (primaryLabelTokens.some((token) => normalizedTranscript.includes(token))) {
      return option.id;
    }

    const keywords = labelKeywords(option.label);
    const matched = keywords.filter((keyword) => normalizedTranscript.includes(keyword));
    const score = matched.length / Math.max(1, keywords.length);
    if (!best || score > best.score) {
      best = { id: option.id, score };
    }
  }

  return best && best.score >= 0.25 ? best.id : null;
}
