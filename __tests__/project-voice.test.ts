import {
  analyzeTranscriptForQuestionOption,
  buildVoiceContextTerms,
  matchTranscriptToQuestionOption,
  transcriptConfirmsSelection,
  transcriptRejectsSelection,
  transcriptRequestsVoiceStop,
} from '../src/lib/project-voice';
import { KITCHEN_QUESTIONS } from '../src/data/fixed-questions';
import type { QuestionnaireQuestion } from '../src/types/database.types';

const question: QuestionnaireQuestion = {
  id: 'k_countertops',
  text: 'What countertop material would you like?',
  type: 'single_select',
  context_note: 'Material choice affects cost.',
  options: [
    { id: 'k_ct_quartz', label: 'Quartz — engineered stone, low maintenance', next_question_id: null },
    { id: 'k_ct_granite', label: 'Granite — natural stone, unique patterns', next_question_id: null },
    { id: 'k_ct_marble', label: 'Marble or Quartzite — premium natural stone', next_question_id: null },
  ],
};

const readNativeVoiceType = () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../src/lib/project-voice.ts'),
    'utf8',
  );
  return source;
};

describe('project voice answer matching', () => {
  it('matches spoken option numbers', () => {
    expect(matchTranscriptToQuestionOption('I choose option two', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I choose option too', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I want option to', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('choice 3', question)).toBe('k_ct_marble');
    expect(matchTranscriptToQuestionOption('the second one', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I want the second option', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('go with the last one', question)).toBe('k_ct_marble');
  });

  it('matches spoken material words to an option', () => {
    expect(matchTranscriptToQuestionOption('I want quartz countertops', question)).toBe('k_ct_quartz');
    expect(matchTranscriptToQuestionOption('marble would be best', question)).toBe('k_ct_marble');
    expect(matchTranscriptToQuestionOption('engineered stone low maintenance', question)).toBe('k_ct_quartz');
    expect(matchTranscriptToQuestionOption('natural stone unique pattern', question)).toBe('k_ct_granite');
  });

  it('matches natural homeowner phrases that do not repeat exact option labels', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };

    expect(matchTranscriptToQuestionOption('as soon as possible', kitchenQuestion('k_timeline'))).toBe('k_time_asap');
    expect(matchTranscriptToQuestionOption('do not move anything, same layout', kitchenQuestion('k_layout'))).toBe('k_lay_none');
    expect(matchTranscriptToQuestionOption('keep the appliances', kitchenQuestion('k_appliances'))).toBe('k_app_none');
    expect(matchTranscriptToQuestionOption('middle range finishes', kitchenQuestion('k_tier'))).toBe('k_tier_mid');
  });

  it('returns confidence metadata for direct and uncertain matches', () => {
    expect(analyzeTranscriptForQuestionOption('option two', question)).toMatchObject({
      optionId: 'k_ct_granite',
      confidence: 1,
      reason: 'position',
    });
    expect(analyzeTranscriptForQuestionOption('natural stone', question)).toMatchObject({
      optionId: 'k_ct_granite',
    });
  });

  it('does not treat unrelated numbers as option selections', () => {
    expect(matchTranscriptToQuestionOption('I need 2 slabs and maybe granite', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I have 2 kids at home', question)).toBeNull();
  });

  it('returns null when transcript is empty or unrelated', () => {
    expect(matchTranscriptToQuestionOption('', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('schedule it for next week', question)).toBeNull();
  });

  it('recognizes yes/no confirmation turns', () => {
    expect(transcriptConfirmsSelection('yes that one is correct')).toBe(true);
    expect(transcriptConfirmsSelection('go ahead and select it')).toBe(true);
    expect(transcriptRejectsSelection('no try again')).toBe(true);
    expect(transcriptRejectsSelection('not that one')).toBe(true);
    expect(transcriptRequestsVoiceStop('pause this for now')).toBe(true);
    expect(transcriptRequestsVoiceStop('stop and let me tap manually')).toBe(true);
  });

  it('builds speech recognition context from option labels and positions', () => {
    const terms = buildVoiceContextTerms(question);

    expect(terms).toContain('option 1');
    expect(terms).toContain('Quartz');
    expect(terms).toContain('Quartz — engineered stone, low maintenance');
    expect(terms).toContain('granite');
    expect(terms).toContain('marble');
  });

  it('stops both speech output and active listening sessions', () => {
    const source = readNativeVoiceType();

    expect(source).toContain('cancelListening?: () => Promise<{ cancelled: boolean }>;');
    expect(source).toContain('nativeVoice.cancelListening()');
  });

  it('asks again once before giving up on an unmatched voice answer', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(source).toContain('const maxAttempts = 2;');
    expect(source).toContain('Let me try that again. You can say the option number, or say the answer in your own words.');
    expect(source).toContain('Trying once more.');
  });
});
