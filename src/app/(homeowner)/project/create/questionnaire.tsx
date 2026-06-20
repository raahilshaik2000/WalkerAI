import { useRef, useEffect, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import {
  analyzeTranscriptForQuestionOption,
  buildVoiceContextTerms,
  extractCorrectedAnswerTranscript,
  isProjectVoiceAvailable,
  listenForProjectAnswer,
  requestProjectVoicePermissions,
  speakProjectDecisionHelp,
  speakProjectQuestion,
  speakProjectPrompt,
  stopProjectVoice,
  transcriptConfirmsSelection,
  transcriptRejectsSelection,
  transcriptRequestsDecisionHelp,
  transcriptRequestsOptionsRepeat,
  transcriptRequestsPreviousQuestion,
  transcriptRequestsVoiceStop,
} from '@/lib/project-voice';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, WizardHeader } from '@/components/ui';

export default function QuestionnaireStep() {
  const navigation = useNavigation<any>();
  const {
    questions,
    answers,
    currentQuestionIndex,
    setAnswer,
    nextQuestion,
    previousQuestion,
  } = useProjectWizardStore();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceWalkthroughActive, setVoiceWalkthroughActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [pendingVoiceMatch, setPendingVoiceMatch] = useState<{ transcript: string; optionId: string; optionLabel: string; confidence: number } | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceWalkthroughRef = useRef(false);

  const question = questions[currentQuestionIndex];
  const voiceAvailable = isProjectVoiceAvailable();
  type ActiveQuestion = NonNullable<typeof question>;

  const resetVoiceFeedback = () => {
    setPendingVoiceMatch(null);
    setVoiceError(null);
    setVoiceTranscript('');
  };

  const animateTransition = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleSelect = (optionId: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setAnswer(question.id, optionId);
  };

  const shortOptionLabel = (label: string) => label.split('—')[0].trim();

  const advanceAfterVoiceAnswer = (answeredQuestion: ActiveQuestion, optionId: string) => {
    const selectedOptionForAdvance = answeredQuestion.options.find((o) => o.id === optionId);
    const nextQuestionId = selectedOptionForAdvance?.next_question_id;
    const latestState = useProjectWizardStore.getState();
    const isLast = latestState.currentQuestionIndex >= latestState.questions.length - 1 || selectedOptionForAdvance?.next_question_id === null;

    if (isLast) {
      useProjectWizardStore.getState().setStep(5);
      navigation.navigate('Renders');
      return false;
    }

    nextQuestion(nextQuestionId ?? null);
    return true;
  };

  type VoiceQuestionResult =
    | { optionId: string; optionLabel: string }
    | { command: 'previous' };

  const goBackByVoice = async () => {
    const latestState = useProjectWizardStore.getState();
    if (latestState.currentQuestionIndex <= 0) {
      setVoiceError('You are already on the first question.');
      await speakProjectPrompt('You are already on the first question.');
      return false;
    }

    previousQuestion();
    setPendingVoiceMatch(null);
    setVoiceTranscript('Moved back one question.');
    await speakProjectPrompt('No problem. Going back to the previous question.');
    return true;
  };

  const askQuestionByVoice = async (activeQuestion: ActiveQuestion): Promise<VoiceQuestionResult | null> => {
    await speakProjectQuestion(activeQuestion);
    const voiceContextTerms = buildVoiceContextTerms(activeQuestion);
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await speakProjectPrompt('Let me try that again. You can say the option number, or say the answer in your own words.');
      }

      const transcript = await listenForProjectAnswer(9, voiceContextTerms);
      setVoiceTranscript(transcript);

      if (transcriptRequestsVoiceStop(transcript)) {
        voiceWalkthroughRef.current = false;
        setVoiceTranscript('Voice walkthrough paused.');
        await speakProjectPrompt('Okay, I paused the voice walkthrough. You can answer manually or start again.');
        return null;
      }

      if (transcriptRequestsOptionsRepeat(transcript)) {
        setVoiceTranscript('Repeating the options.');
        await speakProjectQuestion(activeQuestion);
        continue;
      }

      if (transcriptRequestsDecisionHelp(transcript)) {
        setVoiceTranscript('Explaining the options.');
        await speakProjectDecisionHelp(activeQuestion);
        continue;
      }

      if (transcriptRequestsPreviousQuestion(transcript)) {
        const movedBack = await goBackByVoice();
        return movedBack ? { command: 'previous' } : null;
      }

      const match = analyzeTranscriptForQuestionOption(transcript, activeQuestion);
      if (!match) {
        if (attempt < maxAttempts - 1) {
          setVoiceError(
            transcript
              ? `Heard "${transcript}" but it did not match any option. Trying once more.`
              : 'No speech detected. Trying once more.'
          );
          continue;
        }

        setVoiceError(
          transcript
            ? `Heard "${transcript}" but it did not match any option. Try again or tap an answer.`
            : 'No speech detected. Try again or tap an answer.'
        );
        await speakProjectPrompt('I did not catch a matching option. Please try again or tap an answer.');
        return null;
      }

      const matchedOption = activeQuestion.options.find((o) => o.id === match.optionId);
      if (!matchedOption) {
        setVoiceError('Match failed. Please tap an answer.');
        return null;
      }

      const spokenLabel = shortOptionLabel(matchedOption.label);
      if (match.confidence >= 0.78) {
        ReactNativeHapticFeedback.trigger('notificationSuccess');
        setAnswer(activeQuestion.id, match.optionId);
        setVoiceTranscript(`Heard "${transcript}" and selected ${spokenLabel}.`);
        await speakProjectPrompt(`Got it. I selected ${spokenLabel}.`);
        return { optionId: match.optionId, optionLabel: matchedOption.label };
      }

      await speakProjectPrompt(`I heard ${transcript}. Should I choose ${spokenLabel}? Say yes or no.`);
      const confirmationTranscript = await listenForProjectAnswer(5, ['yes', 'no', 'correct', 'wrong', 'stop', 'pause', spokenLabel]);
      setVoiceTranscript(`${transcript}. Confirmation: ${confirmationTranscript}`);

      if (transcriptRequestsVoiceStop(confirmationTranscript)) {
        voiceWalkthroughRef.current = false;
        setVoiceTranscript('Voice walkthrough paused.');
        await speakProjectPrompt('Okay, I paused the voice walkthrough.');
        return null;
      }

      if (transcriptRequestsOptionsRepeat(confirmationTranscript)) {
        setVoiceTranscript('Repeating the options.');
        await speakProjectQuestion(activeQuestion);
        continue;
      }

      if (transcriptRequestsDecisionHelp(confirmationTranscript)) {
        setVoiceTranscript('Explaining the options.');
        await speakProjectDecisionHelp(activeQuestion);
        continue;
      }

      if (transcriptRequestsPreviousQuestion(confirmationTranscript)) {
        const movedBack = await goBackByVoice();
        return movedBack ? { command: 'previous' } : null;
      }

      if (transcriptConfirmsSelection(confirmationTranscript)) {
        ReactNativeHapticFeedback.trigger('notificationSuccess');
        setAnswer(activeQuestion.id, match.optionId);
        await speakProjectPrompt(`Confirmed. I selected ${spokenLabel}.`);
        return { optionId: match.optionId, optionLabel: matchedOption.label };
      }

      if (transcriptRejectsSelection(confirmationTranscript)) {
        const correctedTranscript = extractCorrectedAnswerTranscript(confirmationTranscript);
        const correctedMatch = analyzeTranscriptForQuestionOption(correctedTranscript, activeQuestion);
        const correctedOption = correctedMatch && correctedMatch.optionId !== match.optionId
          ? activeQuestion.options.find((o) => o.id === correctedMatch.optionId)
          : null;

        if (correctedMatch && correctedOption) {
          const correctedLabel = shortOptionLabel(correctedOption.label);
          if (correctedMatch.confidence >= 0.78) {
            ReactNativeHapticFeedback.trigger('notificationSuccess');
            setAnswer(activeQuestion.id, correctedMatch.optionId);
            setVoiceTranscript(`Correction heard. Selected ${correctedLabel}.`);
            await speakProjectPrompt(`No problem. I selected ${correctedLabel}.`);
            return { optionId: correctedMatch.optionId, optionLabel: correctedOption.label };
          }

          ReactNativeHapticFeedback.trigger('impactLight');
          setPendingVoiceMatch({
            transcript: correctedTranscript,
            optionId: correctedMatch.optionId,
            optionLabel: correctedOption.label,
            confidence: correctedMatch.confidence,
          });
          setVoiceError('I heard your correction, but I need you to confirm it below.');
          return null;
        }

        if (attempt < maxAttempts - 1) {
          setVoiceError('Okay, I will not select that option. Trying once more.');
          continue;
        }

        setVoiceError('Okay, I will not select that option. Try again or tap an answer.');
        await speakProjectPrompt('Okay, I will not select that. Try again or tap an answer.');
        return null;
      }

      ReactNativeHapticFeedback.trigger('impactLight');
      setPendingVoiceMatch({
        transcript,
        optionId: match.optionId,
        optionLabel: matchedOption.label,
        confidence: match.confidence,
      });
      setVoiceError('I could not confirm that by voice. Please confirm below or try again.');
      return null;
    }

    return null;
  };

  const ensureVoicePermissions = async () => {
    const permissions = await requestProjectVoicePermissions();
    if (!permissions.speech || !permissions.microphone) {
      setVoiceError('Microphone and speech recognition permissions are required. Enable them in Settings to answer by voice.');
      return false;
    }
    return true;
  };

  const handleVoiceAnswer = async () => {
    if (!question || voiceBusy || !voiceAvailable) return;

    resetVoiceFeedback();
    setVoiceBusy(true);
    try {
      if (!(await ensureVoicePermissions())) return;
      await askQuestionByVoice(question);
    } catch (err) {
      setVoiceError(formatAppSafeErrorMessage(err, 'Voice answer failed. Try again or answer manually.'));
    } finally {
      setVoiceBusy(false);
      await stopProjectVoice();
    }
  };

  const startVoiceWalkthrough = async () => {
    if (voiceBusy || !voiceAvailable) return;

    resetVoiceFeedback();
    voiceWalkthroughRef.current = true;
    setVoiceWalkthroughActive(true);
    setVoiceBusy(true);

    try {
      if (!(await ensureVoicePermissions())) return;
      await speakProjectPrompt('I will walk you through the questions. Answer naturally, or say stop to pause.');

      let safetyCount = 0;
      while (voiceWalkthroughRef.current && safetyCount < questions.length + 2) {
        safetyCount += 1;
        const latestState = useProjectWizardStore.getState();
        const activeQuestion = latestState.questions[latestState.currentQuestionIndex];
        if (!activeQuestion) {
          useProjectWizardStore.getState().setStep(5);
          navigation.navigate('Renders');
          break;
        }

        const result = await askQuestionByVoice(activeQuestion);
        if (!result || !voiceWalkthroughRef.current) break;
        if (!('optionId' in result)) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        const shouldContinue = advanceAfterVoiceAnswer(activeQuestion, result.optionId);
        if (!shouldContinue) break;

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      setVoiceError(formatAppSafeErrorMessage(err, 'Voice walkthrough failed. Try again or answer manually.'));
    } finally {
      voiceWalkthroughRef.current = false;
      setVoiceWalkthroughActive(false);
      setVoiceBusy(false);
      await stopProjectVoice();
    }
  };

  const stopVoiceWalkthrough = async () => {
    voiceWalkthroughRef.current = false;
    setVoiceWalkthroughActive(false);
    setVoiceBusy(false);
    await stopProjectVoice();
    setVoiceTranscript('Voice walkthrough paused.');
  };

  const confirmVoiceMatch = () => {
    if (!pendingVoiceMatch) return;
    ReactNativeHapticFeedback.trigger('notificationSuccess');
    setAnswer(question.id, pendingVoiceMatch.optionId);
    resetVoiceFeedback();
  };

  const handleNext = () => {
    if (!answers[question.id]) return;

    const answerId = answers[question.id];
    const selectedOption = question.options.find((o) => o.id === answerId);
    const nextQuestionId = selectedOption?.next_question_id;
    const isExplicitTerminal = selectedOption?.next_question_id === null;

    animateTransition(() => {
      const isLast = currentQuestionIndex >= questions.length - 1 || isExplicitTerminal;
      if (isLast) {
        useProjectWizardStore.getState().setStep(5);
        navigation.navigate('Renders');
      } else {
        nextQuestion(nextQuestionId ?? null);
      }
    });
  };

  useEffect(() => {
    if (!question) {
      useProjectWizardStore.getState().setStep(5);
      navigation.navigate('Renders');
    }
  }, [navigation, question]);

  if (!question) return null;

  const selectedAnswer = answers[question.id];
  const selectedOption = question.options.find((option) => option.id === selectedAnswer);
  const isTerminalQuestion = currentQuestionIndex >= questions.length - 1 || selectedOption?.next_question_id === null;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <WizardHeader currentStep={4} />

          <Text style={styles.stepLabel}>
            QUESTION {currentQuestionIndex + 1} OF {questions.length}
          </Text>

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Question */}
            <Text style={styles.questionText}>{question.text}</Text>

            {/* Context note */}
            {question.context_note && (
              <Text style={styles.contextNote}>{question.context_note}</Text>
            )}

            <TouchableOpacity
              style={[styles.voiceWalkthroughButton, voiceWalkthroughActive && styles.voiceWalkthroughButtonActive, (!voiceAvailable || voiceBusy) && !voiceWalkthroughActive && styles.voiceCardDisabled]}
              onPress={voiceWalkthroughActive ? stopVoiceWalkthrough : startVoiceWalkthrough}
              activeOpacity={0.85}
              disabled={!voiceAvailable || (voiceBusy && !voiceWalkthroughActive)}
            >
              <Ionicons
                name={voiceWalkthroughActive ? 'stop-circle-outline' : 'sparkles-outline'}
                size={18}
                color={voiceWalkthroughActive ? '#000' : voiceAvailable ? Colors.accent : Colors.text.tertiary}
              />
              <Text style={[styles.voiceWalkthroughText, voiceWalkthroughActive && styles.voiceWalkthroughTextActive]}>
                {voiceWalkthroughActive ? 'Stop voice walkthrough' : 'Start voice walkthrough'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.voiceCard, voiceBusy && styles.voiceCardActive, !voiceAvailable && styles.voiceCardDisabled]}
              onPress={handleVoiceAnswer}
              activeOpacity={0.85}
              disabled={voiceBusy || !voiceAvailable || !!pendingVoiceMatch || voiceWalkthroughActive}
            >
              <View style={[styles.voiceIcon, voiceBusy && styles.voiceIconActive, !voiceAvailable && styles.voiceIconDisabled]}>
                <Ionicons
                  name={voiceBusy ? 'radio-outline' : 'mic-outline'}
                  size={18}
                  color={voiceBusy ? '#000' : voiceAvailable ? Colors.accent : Colors.text.tertiary}
                />
              </View>
              <View style={styles.voiceTextWrap}>
                <Text style={styles.voiceTitle}>
                  {voiceBusy
                    ? 'Talking with you…'
                    : pendingVoiceMatch
                      ? 'Confirm your answer'
                      : voiceAvailable
                        ? 'Talk through this answer'
                        : 'Voice unavailable on this device'}
                </Text>
                <Text style={styles.voiceSub} numberOfLines={2}>
                  {pendingVoiceMatch
                    ? `Heard "${pendingVoiceMatch.transcript}"`
                    : voiceError
                      ? voiceError
                      : voiceTranscript
                        ? `Heard: ${voiceTranscript}`
                        : voiceAvailable
                          ? 'WalkerAI reads the question, listens, and selects confident matches for you.'
                          : 'Tap an answer manually to continue.'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Pending confirmation row: user verifies the match before
               we apply it. Tapping confirm sets the answer; tapping retry
               starts a fresh listen pass. */}
            {pendingVoiceMatch && (
              <View style={styles.voiceConfirmRow}>
                <View style={styles.voiceConfirmInner}>
                  <Text style={styles.voiceConfirmLabel}>I would pick:</Text>
                  <Text style={styles.voiceConfirmOption} numberOfLines={2}>{pendingVoiceMatch.optionLabel}</Text>
                </View>
                <View style={styles.voiceConfirmActions}>
                  <TouchableOpacity
                    style={[styles.voiceActionBtn, styles.voiceActionRetry]}
                    onPress={() => {
                      resetVoiceFeedback();
                      handleVoiceAnswer();
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="refresh-outline" size={16} color={Colors.text.primary} />
                    <Text style={styles.voiceActionRetryText}>Try again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voiceActionBtn, styles.voiceActionConfirm]}
                    onPress={confirmVoiceMatch}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark" size={16} color="#000" />
                    <Text style={styles.voiceActionConfirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Inline retry when nothing matched. Avoids the modal Alert
               that interrupted the wizard flow before. */}
            {!pendingVoiceMatch && voiceError && !voiceBusy && (
              <TouchableOpacity
                style={styles.voiceRetryInline}
                onPress={() => {
                  resetVoiceFeedback();
                  handleVoiceAnswer();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh-outline" size={14} color={Colors.accent} />
                <Text style={styles.voiceRetryInlineText}>Try again</Text>
              </TouchableOpacity>
            )}

            {/* Options */}
            <View style={styles.optionsContainer}>
              {question.options.map((option) => {
                const isSelected = selectedAnswer === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => handleSelect(option.id)}
                    activeOpacity={0.8}
                  >
                    {isSelected && <View style={styles.selectedIndicator} />}
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

            </View>
          </Animated.View>

          <GlassButton
            label={isTerminalQuestion ? 'Visual Preview' : 'Next'}
            onPress={handleNext}
            disabled={!selectedAnswer}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: Spacing.md },
  questionText: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text.primary,
    lineHeight: 30,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  contextNote: {
    ...Typography.caption,
    marginBottom: Spacing.lg,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.07)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: Spacing.md,
  },
  voiceCardActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
  },
  voiceCardDisabled: {
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    opacity: 0.78,
  },
  voiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
  },
  voiceIconActive: {
    backgroundColor: Colors.accent,
  },
  voiceIconDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  voiceTextWrap: { flex: 1 },
  voiceTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 3 },
  voiceSub: { ...Typography.caption, lineHeight: 17 },
  voiceWalkthroughButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  voiceWalkthroughButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  voiceWalkthroughText: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  voiceWalkthroughTextActive: { color: '#000' },
  voiceConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.32)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    marginTop: -4,
    marginBottom: Spacing.md,
  },
  voiceConfirmInner: { flex: 1, gap: 2 },
  voiceConfirmLabel: { ...Typography.caption, color: Colors.text.tertiary },
  voiceConfirmOption: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, lineHeight: 18 },
  voiceConfirmActions: { flexDirection: 'row', gap: 8 },
  voiceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    minHeight: 32,
  },
  voiceActionRetry: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  voiceActionRetryText: { fontSize: 12, fontWeight: '600', color: Colors.text.primary },
  voiceActionConfirm: { backgroundColor: Colors.accent },
  voiceActionConfirmText: { fontSize: 12, fontWeight: '700', color: '#000' },
  voiceRetryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 107, 0, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    marginTop: -6,
    marginBottom: Spacing.md,
  },
  voiceRetryInlineText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  optionsContainer: {
    gap: 10,
    marginBottom: Spacing.lg,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: 18,
    paddingVertical: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  optionCardSelected: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(255, 107, 0, 0.06)',
  },
  selectedIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Colors.success,
    borderRadius: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.secondary,
    flex: 1,
  },
  optionLabelSelected: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  checkmark: {
    color: Colors.success,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
