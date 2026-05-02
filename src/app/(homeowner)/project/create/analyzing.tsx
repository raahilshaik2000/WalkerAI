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
import { uploadBase64 } from '@/lib/supabase/storage';

import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { useAuthStore } from '@/stores/auth.store';
import { getQuestionsForRoomType } from '@/data/fixed-questions';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

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
  const { projectId, photos, roomType, measurements, setAnalysisResult, setQuestions } = useProjectWizardStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

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
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const runAnalysis = async () => {
      try {
        let pid: string = projectId ?? '';

        if (!pid) {
          const { data: project, error: createError } = await supabase
            .from('projects')
            .insert({
              homeowner_id: user!.id,
              room_type: roomType || 'kitchen',
              status: 'draft',
            })
            .select('id')
            .single();

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
            const path = `${pid}/${i}_${Date.now()}.jpg`;
            const { publicUrl, storagePath } = await uploadBase64('project-photos', path, photo.base64);
            await supabase.from('project_photos').insert({
              project_id: pid,
              url: publicUrl,
              storage_path: storagePath,
            });
          })
        );

        const photoBase64s = localPhotos
          .map((p) => p.base64)
          .filter((b): b is string => !!b);

        if (photoBase64s.length === 0) {
          throw new Error('No photo data found. Please go back and re-select your photos.');
        }

        // Call the analyze-photos edge function (Claude-powered, key stays server-side)
        const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke('analyze-photos', {
          body: { project_id: pid, photo_base64s: photoBase64s },
        });

        if (analyzeError) throw new Error(`Analysis failed: ${analyzeError.message}`);
        if (!analyzeData?.analysis) throw new Error('No analysis returned from server.');

        const analysis = analyzeData.analysis;

        // Wait for photo uploads to finish alongside the edge function call
        await uploadPromise;

        // Edge function already saves ai_analysis — just sync the detected room_type
        const detectedRoomType = analysis.room_type === 'bathroom' ? 'bathroom' : 'kitchen';
        await supabase
          .from('projects')
          .update({ room_type: detectedRoomType })
          .eq('id', pid);

        useProjectWizardStore.getState().setRoomType(detectedRoomType as any);
        setAnalysisResult(analysis);

        // Try AI-conditional questions first, fall back to fixed set
        let questions = null;
        try {
          const { data: qData, error: qError } = await supabase.functions.invoke('generate-questionnaire', {
            body: { project_id: pid, analysis },
          });
          if (!qError && qData?.questions?.length > 0) {
            questions = qData.questions;
          }
        } catch {
          // fall through to fixed questions
        }

        setQuestions(questions ?? getQuestionsForRoomType(detectedRoomType));
        useProjectWizardStore.getState().setStep(4);
        navigation.navigate('Questionnaire');
      } catch (err: any) {
        const msg = err?.message || err?.details || JSON.stringify(err);
        setError(msg);
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
