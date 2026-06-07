import { matchTranscriptToQuestionOption } from '../src/lib/project-voice';
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
    expect(matchTranscriptToQuestionOption('choice 3', question)).toBe('k_ct_marble');
    expect(matchTranscriptToQuestionOption('the second one', question)).toBe('k_ct_granite');
  });

  it('matches spoken material words to an option', () => {
    expect(matchTranscriptToQuestionOption('I want quartz countertops', question)).toBe('k_ct_quartz');
    expect(matchTranscriptToQuestionOption('marble would be best', question)).toBe('k_ct_marble');
  });

  it('does not treat unrelated numbers as option selections', () => {
    expect(matchTranscriptToQuestionOption('I need 2 slabs and maybe granite', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I have 2 kids at home', question)).toBeNull();
  });

  it('returns null when transcript is empty or unrelated', () => {
    expect(matchTranscriptToQuestionOption('', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('schedule it for next week', question)).toBeNull();
  });
});
