import { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Alert,
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
  isProjectVoiceAvailable,
  listenForProjectAnswer,
  matchTranscriptToQuestionOption,
  requestProjectVoicePermissions,
  speakProjectQuestion,
  stopProjectVoice,
} from '@/lib/project-voice';
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
  } = useProjectWizardStore();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const question = questions[currentQuestionIndex];
  const voiceAvailable = isProjectVoiceAvailable();

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

  const handleVoiceAnswer = async () => {
    if (!question || voiceBusy) return;

    if (!voiceAvailable) {
      Alert.alert(
        'Voice answers unavailable',
        'Voice answers are available on iPhone in this version. You can still answer manually here.'
      );
      return;
    }

    setVoiceBusy(true);
    setVoiceTranscript('');
    try {
      const permissions = await requestProjectVoicePermissions();
      if (!permissions.speech || !permissions.microphone) {
        Alert.alert('Permission needed', 'Enable microphone and speech recognition permissions to answer by voice.');
        return;
      }

      await speakProjectQuestion(question);
      const transcript = await listenForProjectAnswer();
      setVoiceTranscript(transcript);

      const matchedOptionId = matchTranscriptToQuestionOption(transcript, question);
      if (!matchedOptionId) {
        Alert.alert(
          'Could not match answer',
          transcript
            ? `I heard "${transcript}", but could not match it to one of the options. Please try again or tap an answer.`
            : 'I did not hear an answer. Please try again or tap an answer.'
        );
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setAnswer(question.id, matchedOptionId);
    } catch (err) {
      Alert.alert('Voice answer failed', err instanceof Error ? err.message : 'Please try again or answer manually.');
    } finally {
      setVoiceBusy(false);
      await stopProjectVoice();
    }
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
              style={[styles.voiceCard, voiceBusy && styles.voiceCardActive, !voiceAvailable && styles.voiceCardDisabled]}
              onPress={handleVoiceAnswer}
              activeOpacity={0.85}
              disabled={voiceBusy || !voiceAvailable}
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
                  {voiceBusy ? 'Listening for your answer…' : voiceAvailable ? 'Answer with voice' : 'Voice unavailable on this device'}
                </Text>
                <Text style={styles.voiceSub} numberOfLines={2}>
                  {voiceTranscript
                    ? `Heard: ${voiceTranscript}`
                    : voiceAvailable
                      ? 'WalkerAI will read the question and select the closest matching option.'
                      : 'Tap an answer manually to continue.'}
                </Text>
              </View>
            </TouchableOpacity>

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
