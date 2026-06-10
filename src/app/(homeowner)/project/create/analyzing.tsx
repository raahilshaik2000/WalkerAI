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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { uploadBase64 } from '@/lib/supabase/storage';
import {
  buildPhotoAnalysisPayload,
  buildProjectAnalysisFallback,
  isMissingAnalysisFunctionError,
} from '@/lib/project-analysis';

import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { useAuthStore } from '@/stores/auth.store';
import { getQuestionsForRoomType } from '@/data/fixed-questions';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';
import type { AIAnalysis } from '@/types/database.types';

const ANALYSIS_STEPS = [
  'Creating your project…',
  'Uploading photos…',
  'Scanning room dimensions…',
  'Identifying existing materials…',
  'Detecting fixtures & appliances…',
  'Assessing structural elements…',
  'Generating renovation questionnaire…',
];

export default function AnalyzingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { projectId, photos, roomType, setAnalysisResult, setQuestions } = useProjectWizardStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const didRunAnalysis = useRef(false);

  useEffect(() => {
    Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [opacityAnim, pulseAnim, rotateAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (didRunAnalysis.current) return;
    didRunAnalysis.current = true;

    const runAnalysis = async () => {
      try {
        let pid: string = projectId ?? '';

        if (!user?.id) {
          throw new Error('You need to be signed in to create a project.');
        }

        if (!pid) {
          const { data: project, error: createError } = await supabase
            .from('projects')
            .insert({
              homeowner_id: user.id,
              room_type: roomType || 'kitchen',
              status: 'draft',
            })
            .select('id')
            .maybeSingle();

          if (createError || !project) {
            throw new Error(`Project creation failed: ${createError?.message ?? 'no data'}`);
          }
          pid = project.id as string;
          useProjectWizardStore.getState().setProjectId(pid);
        }

        const localPhotos = photos.filter((p) => p.status === 'done');
        if (localPhotos.length === 0) throw new Error('No photos found.');

        // Upload photos to storage IN PARALLEL with AI call
        const uploadPromise = Promise.all(
          localPhotos.map(async (photo, i) => {
            if (!photo.base64) return;
            const extension = photo.extension ?? 'jpg';
            const contentType = photo.contentType ?? 'image/jpeg';
            const path = `${pid}/${i}_${Date.now()}.${extension}`;
            const { publicUrl, storagePath } = await uploadBase64('project-photos', path, photo.base64, contentType);
            const { error: photoInsertError } = await supabase.from('project_photos').insert({
              project_id: pid,
              url: publicUrl,
              storage_path: storagePath,
            });
            if (photoInsertError) {
              throw new Error(`Photo upload metadata failed: ${photoInsertError.message}`);
            }
          })
        );

        const photoBase64s = buildPhotoAnalysisPayload(localPhotos);

        if (photoBase64s.length === 0) {
          throw new Error('No photo data found. Please go back and re-select your photos.');
        }

        // Flatten to plain base64 strings so the request body works against both
        // the legacy deployed analyze-photos function (expects string[]) and the
        // newer local function (handles strings via normalizePhotoPayload).
        // Once the new function is deployed, revert to sending the rich payload
        // so HEIC/PNG media-type metadata reaches Claude.
        const photoBase64sFlat = photoBase64s
          .map((p) => p.data)
          .filter((data): data is string => typeof data === 'string' && data.length > 0);

        if (photoBase64sFlat.length === 0) {
          throw new Error('No photo data found. Please go back and re-select your photos.');
        }

        const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke('analyze-photos', {
          body: { project_id: pid, photo_base64s: photoBase64sFlat },
        });

        // Wait for photo uploads to finish alongside the edge function call.
        await uploadPromise;

        let analysis: AIAnalysis;
        if (analyzeError) {
          const analysisMessage = await formatSupabaseFunctionError(analyzeError);
          if (!isMissingAnalysisFunctionError(analysisMessage)) {
            throw new Error(`Analysis failed: ${analysisMessage}`);
          }
          analysis = buildProjectAnalysisFallback(roomType || 'kitchen', analysisMessage);
          const { error: fallbackError } = await supabase
            .from('projects')
            .update({ ai_analysis: analysis })
            .eq('id', pid);
          if (fallbackError) {
            throw new Error(`Analysis fallback failed: ${fallbackError.message}`);
          }
        } else {
          if (!analyzeData?.analysis) throw new Error('No analysis returned from server.');
          analysis = analyzeData.analysis;
        }

        // Respect the homeowner's explicit room type choice. Claude can
        // misclassify a bathroom as a kitchen and vice versa, which then
        // corrupts the questionnaire, customizer, and pricing downstream.
        // Only fall back to Claude's detection if the user never chose one.
        const detectedRoomType = analysis.room_type === 'bathroom' ? 'bathroom' : 'kitchen';
        const effectiveRoomType = roomType ?? detectedRoomType;
        // Combine room_type + ai_analysis into a single update so we don't
        // do two round-trips. ai_analysis persistence is best-effort on the
        // server side too (it races a 10s cap before returning), so writing
        // it here from the client closes that loop.
        const { error: roomTypeError } = await supabase
          .from('projects')
          .update({ room_type: effectiveRoomType, ai_analysis: analysis })
          .eq('id', pid);
        if (roomTypeError) {
          // Don't hard-fail on this — the analysis is already in the wizard
          // store, the user can still proceed to the questionnaire. Log
          // the failure for visibility.
          console.warn('[analyzing] room_type + ai_analysis sync failed:', roomTypeError.message);
        }

        useProjectWizardStore.getState().setRoomType(effectiveRoomType as any);
        setAnalysisResult(analysis);

        // The pricing engine depends on canonical question IDs (k_tier,
        // b_tier, etc.). Keep the active flow on the fixed set until dynamic
        // questions can emit the same schema.
        setQuestions(getQuestionsForRoomType(effectiveRoomType));
        useProjectWizardStore.getState().setStep(4);
        navigation.navigate('Questionnaire');
      } catch (err: any) {
        const msg = err?.message || err?.details || JSON.stringify(err);
        setError(msg);
      }
    };

    runAnalysis();
  }, [navigation, photos, projectId, roomType, setAnalysisResult, setQuestions, user]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (error) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <View style={styles.errorCircle}>
              <Ionicons name="alert-circle-outline" size={48} color="#FF6B00" />
            </View>
            <Text style={styles.errorTitle}>Analysis failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
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
              <Ionicons name="sparkles" size={32} color="#FF6B00" />
            </View>
          </View>

          <Text style={styles.headline}>Analyzing your space</Text>
          <Text style={styles.stepText}>{ANALYSIS_STEPS[currentStep]}</Text>

          <View style={styles.dotsRow}>
            {ANALYSIS_STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentStep && styles.dotActive]}
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
    borderColor: 'rgba(255, 107, 0, 0.2)',
  },
  ringMid: {
    width: 130,
    height: 130,
    borderColor: 'rgba(255, 107, 0, 0.35)',
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
    backgroundColor: '#FF6B00',
    marginTop: 2,
  },
  core: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  dotActive: { backgroundColor: '#FF6B00' },
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  errorTitle: { ...Typography.h2, marginBottom: 10, textAlign: 'center' },
  errorBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
