import {
  analyzeTranscriptForQuestionOption,
  buildVoiceContextTerms,
  extractCorrectedAnswerTranscript,
  matchTranscriptToQuestionOption,
  optionExplanationForTranscript,
  recommendedOptionForQuestion,
  transcriptAcceptsRecommendation,
  transcriptAcceptsSuggestionFollowUp,
  transcriptConfirmsSelection,
  transcriptRejectsSelection,
  transcriptRequestsDecisionHelp,
  transcriptRequestsOptionsRepeat,
  transcriptRequestsPreviousQuestion,
  transcriptRequestsVoiceStop,
} from '../src/lib/project-voice';
import { BATHROOM_QUESTIONS, KITCHEN_QUESTIONS } from '../src/data/fixed-questions';
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

const readNativeVoiceSource = () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '../ios/WalkerAI/Voice/WalkerVoiceAssistant.swift'),
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

  it('does not select an option the user explicitly rejects', () => {
    expect(matchTranscriptToQuestionOption('not quartz but granite', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('no quartz granite', question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption('I do not want quartz', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('anything but quartz', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('not marble, quartz', question)).toBe('k_ct_quartz');
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

  it('matches conversational kitchen answers across every project question', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };

    expect(matchTranscriptToQuestionOption('I like a classic and modern mix', kitchenQuestion('k_style'))).toBe('k_style_transitional');
    expect(matchTranscriptToQuestionOption('let us do shaker cabinets with a warm farmhouse look', kitchenQuestion('k_style'))).toBe('k_style_farmhouse');
    expect(matchTranscriptToQuestionOption('modern farmhouse', kitchenQuestion('k_style'))).toBe('k_style_farmhouse');
    expect(matchTranscriptToQuestionOption('rip out the old cabinets and put in new cabinets', kitchenQuestion('k_cabinets'))).toBe('k_cab_full');
    expect(matchTranscriptToQuestionOption('just replace the doors and keep the existing boxes', kitchenQuestion('k_cabinets'))).toBe('k_cab_reface');
    expect(matchTranscriptToQuestionOption('we only want to repaint the cabinets', kitchenQuestion('k_cabinets'))).toBe('k_cab_paint');
    expect(matchTranscriptToQuestionOption('leave the cabinets as is', kitchenQuestion('k_cabinets'))).toBe('k_cab_keep');
    expect(matchTranscriptToQuestionOption('I want a porcelain slab', kitchenQuestion('k_countertops'))).toBe('k_ct_porcelain');
    expect(matchTranscriptToQuestionOption('keep the current counters', kitchenQuestion('k_countertops'))).toBe('k_ct_keep');
    expect(matchTranscriptToQuestionOption('replace the floor completely', kitchenQuestion('k_flooring'))).toBe('k_floor_full');
    expect(matchTranscriptToQuestionOption('sand and refinish the existing floor', kitchenQuestion('k_flooring'))).toBe('k_floor_repair');
    expect(matchTranscriptToQuestionOption('leave the floor alone', kitchenQuestion('k_flooring'))).toBe('k_floor_keep');
    expect(matchTranscriptToQuestionOption('move a window but nothing major', kitchenQuestion('k_layout'))).toBe('k_lay_minor');
    expect(matchTranscriptToQuestionOption('we are moving walls and relocating plumbing', kitchenQuestion('k_layout'))).toBe('k_lay_major');
  });

  it('matches budget, timeline, appliance, and living-at-home phrases across kitchen questions', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };

    expect(matchTranscriptToQuestionOption('whatever is cheapest', kitchenQuestion('k_tier'))).toBe('k_tier_budget');
    expect(matchTranscriptToQuestionOption('not too cheap but not too expensive', kitchenQuestion('k_tier'))).toBe('k_tier_mid');
    expect(matchTranscriptToQuestionOption('top of the line finishes', kitchenQuestion('k_tier'))).toBe('k_tier_luxury');
    expect(matchTranscriptToQuestionOption('some appliances but not all', kitchenQuestion('k_appliances'))).toBe('k_app_some');
    expect(matchTranscriptToQuestionOption('replace the full appliance suite', kitchenQuestion('k_appliances'))).toBe('k_app_full');
    expect(matchTranscriptToQuestionOption('no rush, I am flexible', kitchenQuestion('k_timeline'))).toBe('k_time_flexible');
    expect(matchTranscriptToQuestionOption('I will be staying in the house', kitchenQuestion('k_home'))).toBe('k_home_yes');
    expect(matchTranscriptToQuestionOption('we are moving out somewhere else', kitchenQuestion('k_home'))).toBe('k_home_no');
  });

  it('maps preference questions to practical recommendations when the user asks conversationally', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };
    const bathroomQuestion = (id: string) => {
      const found = BATHROOM_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing bathroom question ${id}`);
      return found;
    };

    expect(analyzeTranscriptForQuestionOption('what is best for resale', kitchenQuestion('k_style'))).toMatchObject({
      optionId: 'k_style_transitional',
      confidence: 0.9,
    });
    expect(analyzeTranscriptForQuestionOption('I want the lowest maintenance countertop', kitchenQuestion('k_countertops'))).toMatchObject({
      optionId: 'k_ct_quartz',
      confidence: 0.95,
    });
    expect(matchTranscriptToQuestionOption('what is the cheapest countertop option', kitchenQuestion('k_countertops'))).toBe('k_ct_keep');
    expect(matchTranscriptToQuestionOption('what is the best value quality level', kitchenQuestion('k_tier'))).toBe('k_tier_mid');
    expect(matchTranscriptToQuestionOption('I want the simplest and fastest layout', kitchenQuestion('k_layout'))).toBe('k_lay_none');
    expect(matchTranscriptToQuestionOption('best for a family bathroom', bathroomQuestion('b_shower'))).toBe('b_sh_combo');
    expect(matchTranscriptToQuestionOption('best value tile scope', bathroomQuestion('b_tile'))).toBe('b_tile_shower');
    expect(matchTranscriptToQuestionOption('least disruption during the bathroom work', bathroomQuestion('b_home'))).toBe('b_home_no');
  });

  it('selects a default recommendation when the user accepts the assistant recommendation', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };
    const bathroomQuestion = (id: string) => {
      const found = BATHROOM_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing bathroom question ${id}`);
      return found;
    };

    expect(recommendedOptionForQuestion(kitchenQuestion('k_countertops'))).toMatchObject({
      id: 'k_ct_quartz',
      label: 'Quartz',
    });
    expect(matchTranscriptToQuestionOption('go with your recommendation', kitchenQuestion('k_countertops'))).toBe('k_ct_quartz');
    expect(matchTranscriptToQuestionOption('whatever you recommend is fine', kitchenQuestion('k_tier'))).toBe('k_tier_mid');
    expect(matchTranscriptToQuestionOption('choose the recommended one', bathroomQuestion('b_tile'))).toBe('b_tile_shower');
    expect(matchTranscriptToQuestionOption('you decide', kitchenQuestion('k_countertops'))).toBe('k_ct_quartz');
    expect(matchTranscriptToQuestionOption('surprise me', bathroomQuestion('b_plumbing'))).toBe('b_plumb_none');
    expect(analyzeTranscriptForQuestionOption('use your default suggestion', bathroomQuestion('b_plumbing'))).toMatchObject({
      optionId: 'b_plumb_none',
      confidence: 0.96,
    });
  });

  it('explains a mentioned option instead of selecting it when the transcript is a question', () => {
    expect(optionExplanationForTranscript('what is quartz', question)).toMatchObject({
      optionId: 'k_ct_quartz',
      label: 'Quartz',
      detail: 'engineered stone, low maintenance',
    });
    expect(optionExplanationForTranscript('tell me about granite', question)).toMatchObject({
      optionId: 'k_ct_granite',
      label: 'Granite',
    });
    expect(optionExplanationForTranscript('what about quartz', question)).toMatchObject({
      optionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('why quartz', question)).toMatchObject({
      optionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('is quartz good', question)).toMatchObject({
      optionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('explain option two', question)).toMatchObject({
      optionId: 'k_ct_granite',
    });
    expect(optionExplanationForTranscript('what is the difference between quartz and granite', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_quartz',
      recommendedOptionLabel: 'Quartz',
      label: 'Quartz and Granite',
      detail: expect.stringContaining('Quartz means engineered stone, low maintenance. Granite means natural stone, unique patterns.'),
    });
    expect(optionExplanationForTranscript('compare quartz and granite', question)).toMatchObject({
      optionId: null,
      label: 'Quartz and Granite',
    });
    expect(optionExplanationForTranscript('which is better quartz or granite', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('is quartz better than granite', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('quartz or granite', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_quartz',
    });
    expect(optionExplanationForTranscript('granite or marble', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_granite',
      recommendedOptionLabel: 'Granite',
    });
    expect(optionExplanationForTranscript('marble or granite', question)).toMatchObject({
      optionId: null,
      recommendedOptionId: 'k_ct_granite',
    });
    expect(matchTranscriptToQuestionOption('what is quartz', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('what about quartz', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('is quartz better than granite', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('granite or marble', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('what is the difference between quartz and granite', question)).toBeNull();
    expect(matchTranscriptToQuestionOption('which is better quartz or granite', question)).toBeNull();
    expect(optionExplanationForTranscript('what is the best value quality level', KITCHEN_QUESTIONS.find((item) => item.id === 'k_tier')!)).toBeNull();
  });

  it('matches bathroom-specific natural phrases without exact labels', () => {
    const bathroomQuestion = (id: string) => {
      const found = BATHROOM_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing bathroom question ${id}`);
      return found;
    };

    expect(matchTranscriptToQuestionOption('walk in shower no tub', bathroomQuestion('b_shower'))).toBe('b_sh_walkin');
    expect(matchTranscriptToQuestionOption('tub shower combo', bathroomQuestion('b_shower'))).toBe('b_sh_combo');
    expect(matchTranscriptToQuestionOption('double sink vanity', bathroomQuestion('b_vanity'))).toBe('b_van_double');
    expect(matchTranscriptToQuestionOption('wall mounted sink', bathroomQuestion('b_vanity'))).toBe('b_van_floating');
    expect(matchTranscriptToQuestionOption('only the shower area', bathroomQuestion('b_tile'))).toBe('b_tile_shower');
    expect(matchTranscriptToQuestionOption('only the floor', bathroomQuestion('b_tile'))).toBe('b_tile_floor');
    expect(matchTranscriptToQuestionOption('do not move plumbing', bathroomQuestion('b_plumbing'))).toBe('b_plumb_none');
  });

  it('matches conversational bathroom answers across every project question', () => {
    const bathroomQuestion = (id: string) => {
      const found = BATHROOM_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing bathroom question ${id}`);
      return found;
    };

    expect(matchTranscriptToQuestionOption('make it feel like a modern hotel spa', bathroomQuestion('b_style'))).toBe('b_style_modern');
    expect(matchTranscriptToQuestionOption('matte black fixtures and farmhouse style', bathroomQuestion('b_style'))).toBe('b_style_farmhouse');
    expect(matchTranscriptToQuestionOption('builder grade is fine', bathroomQuestion('b_tier'))).toBe('b_tier_budget');
    expect(matchTranscriptToQuestionOption('premium natural stone finishes', bathroomQuestion('b_tier'))).toBe('b_tier_luxury');
    expect(matchTranscriptToQuestionOption('keep the existing shower tub layout', bathroomQuestion('b_shower'))).toBe('b_sh_keep');
    expect(matchTranscriptToQuestionOption('we want a new toilet', bathroomQuestion('b_toilet'))).toBe('b_toil_replace');
    expect(matchTranscriptToQuestionOption('keep the existing toilet', bathroomQuestion('b_toilet'))).toBe('b_toil_keep');
    expect(matchTranscriptToQuestionOption('same wall, just move plumbing a foot', bathroomQuestion('b_plumbing'))).toBe('b_plumb_minor');
    expect(matchTranscriptToQuestionOption('the drain is moving to a different wall', bathroomQuestion('b_plumbing'))).toBe('b_plumb_major');
    expect(matchTranscriptToQuestionOption('start right away', bathroomQuestion('b_timeline'))).toBe('b_time_asap');
    expect(matchTranscriptToQuestionOption('we will be home some days', bathroomQuestion('b_home'))).toBe('b_home_partial');
  });

  it('returns confidence metadata for direct and uncertain matches', () => {
    const kitchenQuestion = (id: string) => {
      const found = KITCHEN_QUESTIONS.find((item) => item.id === id);
      if (!found) throw new Error(`Missing kitchen question ${id}`);
      return found;
    };

    expect(analyzeTranscriptForQuestionOption('option two', question)).toMatchObject({
      optionId: 'k_ct_granite',
      confidence: 1,
      reason: 'position',
    });
    expect(analyzeTranscriptForQuestionOption('natural stone', question)).toMatchObject({
      optionId: 'k_ct_granite',
    });
    expect(analyzeTranscriptForQuestionOption('classic modern', kitchenQuestion('k_style'))).toMatchObject({
      optionId: 'k_style_transitional',
      confidence: 0.68,
      reason: 'keywords',
    });
  });

  it('lowers confidence when fallback keyword scoring cannot clearly separate two options', () => {
    const ambiguousTileQuestion: QuestionnaireQuestion = {
      id: 'ambiguous_tile_scope',
      text: 'Where should tile be installed?',
      type: 'single_select',
      context_note: '',
      options: [
        { id: 'floor_tile', label: 'Floor tile — porcelain tile floor', next_question_id: null },
        { id: 'shower_tile', label: 'Shower tile — porcelain tile walls', next_question_id: null },
      ],
    };

    expect(analyzeTranscriptForQuestionOption('porcelain tile floor and shower', ambiguousTileQuestion)).toMatchObject({
      optionId: 'floor_tile',
      confidence: 0.68,
      reason: 'keywords',
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
    expect(transcriptConfirmsSelection('no that is not right')).toBe(false);
    expect(transcriptConfirmsSelection('not that one')).toBe(false);
    expect(transcriptRejectsSelection('no try again')).toBe(true);
    expect(transcriptRejectsSelection('not that one')).toBe(true);
    expect(transcriptRejectsSelection('no that is not right')).toBe(true);
    expect(transcriptRequestsDecisionHelp('I am not sure, help me choose')).toBe(true);
    expect(transcriptRequestsDecisionHelp('what do you recommend')).toBe(true);
    expect(transcriptAcceptsRecommendation('go with your recommendation')).toBe(true);
    expect(transcriptRequestsDecisionHelp('go with your recommendation')).toBe(false);
    expect(transcriptAcceptsSuggestionFollowUp('that sounds good')).toBe(true);
    expect(transcriptAcceptsSuggestionFollowUp('lets do that')).toBe(true);
    expect(transcriptAcceptsSuggestionFollowUp('yes')).toBe(true);
    expect(transcriptAcceptsSuggestionFollowUp('okay')).toBe(true);
    expect(transcriptAcceptsSuggestionFollowUp('perfect')).toBe(true);
    expect(transcriptAcceptsSuggestionFollowUp('no that is not right')).toBe(false);
    expect(transcriptRequestsOptionsRepeat('what are the options again')).toBe(true);
    expect(transcriptRequestsPreviousQuestion('go back to the previous question')).toBe(true);
    expect(transcriptRequestsPreviousQuestion('change my last answer')).toBe(true);
    expect(transcriptRequestsVoiceStop('pause this for now')).toBe(true);
    expect(transcriptRequestsVoiceStop('stop and let me tap manually')).toBe(true);
  });

  it('extracts corrected answers from confirmation turns', () => {
    expect(extractCorrectedAnswerTranscript('no I meant granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('not quartz but granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('not quartz instead granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('no second option')).toBe('second option');
    expect(extractCorrectedAnswerTranscript('actually the third one')).toBe('third one');
    expect(extractCorrectedAnswerTranscript('no not quartz granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('no it is granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('changed my mind granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('I changed my mind, I want granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('change it to granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('switch to granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('make it quartz')).toBe('quartz');
    expect(extractCorrectedAnswerTranscript('set it to marble')).toBe('marble');
    expect(extractCorrectedAnswerTranscript('actually go with granite')).toBe('granite');
    expect(extractCorrectedAnswerTranscript('use granite instead')).toBe('granite');

    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('no I meant granite'), question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('not quartz but granite'), question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('no second option'), question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('actually the third one'), question)).toBe('k_ct_marble');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('change it to granite'), question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('switch to granite'), question)).toBe('k_ct_granite');
    expect(matchTranscriptToQuestionOption(extractCorrectedAnswerTranscript('make it quartz'), question)).toBe('k_ct_quartz');
    expect(transcriptRejectsSelection('changed my mind granite')).toBe(true);
    expect(transcriptRejectsSelection('switch to granite')).toBe(true);
  });

  it('builds speech recognition context from option labels and positions', () => {
    const terms = buildVoiceContextTerms(question);
    const countertopTerms = buildVoiceContextTerms(KITCHEN_QUESTIONS.find((item) => item.id === 'k_countertops')!);

    expect(terms).toContain('option 1');
    expect(terms).toContain('Quartz');
    expect(terms).toContain('Quartz — engineered stone, low maintenance');
    expect(terms).toContain('granite');
    expect(terms).toContain('marble');
    expect(terms).toContain('help me choose');
    expect(terms).toContain('what do you recommend');
    expect(terms).toContain('tell me about option 1');
    expect(terms).toContain('explain option 1');
    expect(terms).toContain('go with your recommendation');
    expect(terms).toContain('whatever you recommend');
    expect(terms).toContain('that sounds good');
    expect(terms).toContain('lets do that');
    expect(terms).toContain('okay');
    expect(terms).toContain('perfect');
    expect(terms).toContain('you decide');
    expect(terms).toContain('go back');
    expect(terms).toContain('change my last answer');
    expect(countertopTerms).toContain('porcelain slab');
    expect(countertopTerms).toContain('keep countertops');
  });

  it('stops both speech output and active listening sessions', () => {
    const source = readNativeVoiceType();

    expect(source).toContain('cancelListening?: () => Promise<{ cancelled: boolean }>;');
    expect(source).toContain('nativeVoice.cancelListening()');
  });

  it('finishes native listening shortly after speech stops', () => {
    const source = readNativeVoiceSource();

    expect(source).toContain('private var silenceTimer: Timer?');
    expect(source).toContain('private let silenceFinishDelay: TimeInterval = 1.15');
    expect(source).toContain('self.scheduleSilenceFinishIfNeeded()');
    expect(source).toContain('silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceFinishDelay');
    expect(source).toContain('silenceTimer?.invalidate()');
  });

  it('asks again before giving up on an unmatched voice answer', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(source).toContain('const maxAttempts = 3;');
    expect(source).toContain('Let me try that again. You can say the option number, or say the answer in your own words.');
    expect(source).toContain('Trying once more.');
  });

  it('keeps voice confirmation conversational for corrections and repeats', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(source).toContain('transcriptRequestsOptionsRepeat(confirmationTranscript)');
    expect(source).toContain('...voiceContextTerms,');
    expect(source).toContain('const alternateMatch = analyzeTranscriptForQuestionOption(confirmationTranscript, activeQuestion);');
    expect(source).toContain('extractCorrectedAnswerTranscript(confirmationTranscript)');
    expect(source).toContain('No problem. I selected');
    expect(source).toContain('Got it. I selected');
    expect(source).toContain('Repeating the options.');
    expect(source).toContain('I still need to confirm that. Please say yes, no, or say the answer you want.');
  });

  it('uses more natural spoken question prompts and iOS voices', () => {
    const voiceSource = readNativeVoiceType();
    const nativeSource = readNativeVoiceSource();

    expect(voiceSource).toContain('You can say an option number, answer in your own words, ask me to repeat, or say help me choose.');
    expect(nativeSource).toContain('let preferredNames = ["Samantha", "Ava", "Allison", "Joelle", "Karen", "Moira", "Daniel"]');
    expect(nativeSource).toContain('utterance.preUtteranceDelay = 0.04');
    expect(nativeSource).toContain('utterance.postUtteranceDelay = 0.08');
  });

  it('keeps voice walkthrough navigable without manual taps', () => {
    const questionnaireSource = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );
    const storeSource = require('fs').readFileSync(
      require('path').join(__dirname, '../src/stores/project-wizard.store.ts'),
      'utf8',
    );

    expect(storeSource).toContain('previousQuestion: () => void;');
    expect(storeSource).toContain('Math.max(0, currentQuestionIndex - 1)');
    expect(questionnaireSource).toContain('transcriptRequestsPreviousQuestion(transcript)');
    expect(questionnaireSource).toContain("return movedBack ? { command: 'previous' } : null;");
    expect(questionnaireSource).toContain("if (!('optionId' in result))");
  });

  it('answers help-me-choose turns with option guidance and keeps listening', () => {
    const voiceSource = require('fs').readFileSync(
      require('path').join(__dirname, '../src/lib/project-voice.ts'),
      'utf8',
    );
    const questionnaireSource = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(voiceSource).toContain('export async function speakProjectDecisionHelp(question: QuestionnaireQuestion)');
    expect(voiceSource).toContain('const recommendation = decisionRecommendation(question);');
    expect(voiceSource).toContain('const defaultRecommendation = recommendedOptionForQuestion(question);');
    expect(voiceSource).toContain('My default recommendation is option');
    expect(voiceSource).toContain('A safe choice for resale is transitional.');
    expect(voiceSource).toContain('Quartz is usually the safest low-maintenance choice.');
    expect(voiceSource).toContain('Which one sounds closest?');
    expect(questionnaireSource).toContain('transcriptRequestsDecisionHelp(transcript)');
    expect(questionnaireSource).toContain('!transcriptAcceptsRecommendation(transcript)');
    expect(questionnaireSource).toContain('optionExplanationForTranscript(transcript, activeQuestion)');
    expect(questionnaireSource).toContain('await speakProjectOptionExplanation(optionExplanation);');
    expect(questionnaireSource).toContain('optionExplanation.optionId ?? optionExplanation.recommendedOptionId ?? null');
    expect(questionnaireSource).toContain("'the comparison recommendation'");
    expect(voiceSource).toContain('You can choose one, ask about another option, or say help me choose.');
    expect(voiceSource).toContain('My recommendation is');
    expect(questionnaireSource).toContain('(lastExplainedOptionId || suggestionWasOffered) && transcriptAcceptsSuggestionFollowUp(transcript)');
    expect(questionnaireSource).toContain('selectVoiceOption(optionId, transcript');
    expect(questionnaireSource).toContain('await speakProjectDecisionHelp(activeQuestion);');
    expect(questionnaireSource).toContain("setVoiceTranscript('Explaining the options.');");
  });
});
