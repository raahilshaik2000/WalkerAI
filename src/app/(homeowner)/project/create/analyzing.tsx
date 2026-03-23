import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

const ANALYSIS_STEPS = [
  'Scanning room dimensions…',
  'Identifying existing materials…',
  'Detecting fixtures & appliances…',
  'Assessing structural elements…',
  'Generating renovation questionnaire…',
];

export default function AnalyzingScreen() {
  const navigation = useNavigation<any>();
  const { projectId, photos, setAnalysisResult, setQuestions } = useProjectWizardStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Pulse animation for the outer ring
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    // Continuous pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Spinning arc
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  // Cycle through step labels
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Trigger AI analysis
  useEffect(() => {
    const runAnalysis = async () => {
      try {
        const photoUrls = photos
          .filter((p) => p.status === 'done' && p.url)
          .map((p) => p.url);

        if (photoUrls.length === 0) throw new Error('No uploaded photos found.');

        // Call analyze-photos edge function
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
          'analyze-photos',
          { body: { project_id: projectId, photo_urls: photoUrls } }
        );
        if (analysisError) throw analysisError;

        setAnalysisResult(analysisData.analysis);

        // Call generate-questionnaire edge function
        const { data: questionnaireData, error: questionnaireError } = await supabase.functions.invoke(
          'generate-questionnaire',
          { body: { project_id: projectId, analysis: analysisData.analysis } }
        );
        if (questionnaireError) throw questionnaireError;

        setQuestions(questionnaireData.questions);
        useProjectWizardStore.getState().setStep(4);
        navigation.navigate('Questionnaire');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      }
    };

    runAnalysis();
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (error) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Analysis failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground glow="center">
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.center, { opacity: opacityAnim }]}>
          {/* Pulsing rings */}
          <View style={styles.ringContainer}>
            <Animated.View style={[styles.ring, styles.ringOuter, { transform: [{ scale: pulseAnim }] }]} />
            <Animated.View style={[styles.ring, styles.ringMid, { transform: [{ scale: pulseAnim }] }]} />

            {/* Spinning arc */}
            <Animated.View style={[styles.spinArc, { transform: [{ rotate: spin }] }]}>
              <View style={styles.spinDot} />
            </Animated.View>

            {/* Core icon */}
            <View style={styles.core}>
              <Text style={styles.coreIcon}>🤖</Text>
            </View>
          </View>

          <Text style={styles.headline}>Analyzing your space</Text>
          <Text style={styles.stepText}>{ANALYSIS_STEPS[currentStep]}</Text>

          <View style={styles.dotsRow}>
            {ANALYSIS_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentStep && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  ringContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  ringOuter: {
    width: 180,
    height: 180,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  ringMid: {
    width: 130,
    height: 130,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  spinArc: {
    position: 'absolute',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  spinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    marginTop: 2,
  },
  core: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreIcon: { fontSize: 34 },
  headline: { ...Typography.h2, textAlign: 'center', marginBottom: 12 },
  stepText: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    minHeight: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.glass.border,
  },
  dotActive: { backgroundColor: Colors.accent },
  errorIcon: { fontSize: 48, marginBottom: Spacing.sm },
  errorTitle: { ...Typography.h2, marginBottom: 10, textAlign: 'center' },
  errorBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
