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
import { uploadFile } from '@/lib/supabase/storage';

import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { useAuthStore } from '@/stores/auth.store';

const OPENAI_KEY = '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';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function buildPrompt(roomType: string): string {
  return `Analyze these ${roomType} renovation photos and return a single valid JSON object with this exact structure — no markdown, no explanation, just the JSON:

{
  "analysis": {
    "room_type": "${roomType}",
    "existing_materials": {
      "cabinets": { "type": "string", "condition": "poor|fair|good", "estimated_age_years": 0 },
      "countertops": { "material": "string", "condition": "string" },
      "flooring": { "material": "string", "condition": "string" },
      "fixtures": ["string"],
      "appliances": ["string"]
    },
    "layout": {
      "estimated_sqft": 0,
      "has_island": false,
      "plumbing_wall_visible": false,
      "window_count": 0
    },
    "structural_concerns": ["string"],
    "ai_observations": "2-3 sentence summary for the homeowner about what you see"
  },
  "questions": [
    {
      "id": "q1",
      "text": "Question text here",
      "type": "single_select",
      "options": [
        { "id": "q1_a", "label": "Option label", "next_question_id": "q2" },
        { "id": "q1_b", "label": "Option label", "next_question_id": null }
      ],
      "context_note": "Why we're asking this"
    }
  ]
}

Requirements for questions:
- 6-8 questions maximum
- Cover: design style (modern/traditional/transitional/contemporary), material quality tier (budget/mid-range/luxury), timeline urgency, specific pain points from what you observed, staying home during renovation
- Use branching (next_question_id) to skip irrelevant follow-ups. Set next_question_id to null for terminal branches
- Make questions feel personalized to what you actually see in the photos
- All question IDs must be unique strings like "q1", "q2", etc.
- All option IDs must be unique strings like "q1_a", "q1_b", etc.`;
}
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
  const { projectId, photos, roomType, setAnalysisResult, setQuestions } = useProjectWizardStore();

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

        // Upload photos to storage IN PARALLEL with AI call so they complete before we navigate
        const uploadPromise = Promise.all(
          localPhotos.map(async (photo, i) => {
            if (!photo.uri) return;
            try {
              const path = `${pid}/${i}_${Date.now()}.jpg`;
              const { publicUrl, storagePath } = await uploadFile('project-photos', path, photo.uri, 'image/jpeg');
              await supabase.from('project_photos').insert({
                project_id: pid,
                url: publicUrl,
                storage_path: storagePath,
              });
            } catch {
              // Individual upload failure should not block analysis
            }
          })
        );

        const photoBase64s = localPhotos
          .map((p) => p.base64)
          .filter((b): b is string => !!b);

        if (photoBase64s.length === 0) {
          throw new Error('No photo data found. Please go back and re-select your photos.');
        }

        // Build image content blocks (OpenAI format)
        const imageBlocks = photoBase64s.slice(0, 4).map((b64) => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` },
        }));

        // Single OpenAI call — returns analysis + questions together
        const res = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: [
                ...imageBlocks,
                { type: 'text', text: buildPrompt(roomType || 'kitchen') },
              ],
            }],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`AI request failed (${res.status}): ${errText}`);
        }

        const aiResponse = await res.json();
        const rawText: string = aiResponse.choices[0].message.content;

        // Strip markdown fences if Claude wrapped the JSON
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned);
        const analysis = parsed.analysis;
        const questions = parsed.questions;

        // Save analysis + detected room type to DB, and wait for photo uploads to finish
        const detectedRoomType = analysis.room_type === 'bathroom' ? 'bathroom' : 'kitchen';
        await Promise.all([
          supabase
            .from('projects')
            .update({ ai_analysis: analysis, room_type: detectedRoomType })
            .eq('id', pid),
          uploadPromise,
        ]);

        useProjectWizardStore.getState().setRoomType(detectedRoomType as any);
        setAnalysisResult(analysis);
        setQuestions(questions);
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
