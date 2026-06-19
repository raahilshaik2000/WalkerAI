import {
  analyzeTranscriptForQuestionOption,
  buildVoiceContextTerms,
  matchTranscriptToQuestionOption,
  transcriptConfirmsSelection,
  transcriptRejectsSelection,
  transcriptRequestsVoiceStop,
} from '../src/lib/project-voice';
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
});
