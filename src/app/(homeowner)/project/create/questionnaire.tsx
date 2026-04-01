import { useState, useRef, useEffect } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
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

  const question = questions[currentQuestionIndex];

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

  const handleNext = () => {
    if (!answers[question.id]) return;

    const answerId = answers[question.id];
    const selectedOption = question.options.find((o) => o.id === answerId);
    const nextQuestionId = selectedOption?.next_question_id;

    animateTransition(() => {
      const isLast = currentQuestionIndex >= questions.length - 1 || !nextQuestionId;
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
  }, [question]);

  if (!question) return null;

  const selectedAnswer = answers[question.id];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

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
            label={currentQuestionIndex >= questions.length - 1 ? 'See Renders' : 'Next'}
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
