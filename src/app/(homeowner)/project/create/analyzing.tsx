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
import { uploadFile, getSignedUrl } from '@/lib/supabase/storage';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { useAuthStore } from '@/stores/auth.store';
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
        let pid = projectId;

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

          if (createError) {
            throw new Error(`Project creation failed: ${createError.message}`);
          }
          pid = project.id;
          useProjectWizardStore.getState().setProjectId(pid);
        }

        const localPhotos = photos.filter((p) => p.status === 'done');
        if (localPhotos.length === 0) throw new Error('No photos found.');

        const photoUrls: string[] = [];
        for (const photo of localPhotos) {
          const storagePath = `${pid}/${photo.id}.jpg`;

          let publicUrl: string;
          try {
            const result = await uploadFile('project-photos', storagePath, photo.uri, 'image/jpeg');
            publicUrl = result.publicUrl;
          } catch (uploadErr: any) {
            throw new Error(`Photo upload failed: ${uploadErr?.message ?? String(uploadErr)}`);
          }

          // project-photos bucket is private — get a signed URL so Anthropic can fetch the image
          let signedUrl: string;
          try {
            signedUrl = await getSignedUrl('project-photos', storagePath, 3600);
          } catch (signErr: any) {
            throw new Error(`Could not create signed URL: ${signErr?.message ?? String(signErr)}`);
          }
          photoUrls.push(signedUrl);

          await supabase.from('project_photos').insert({
            project_id: pid,
            url: publicUrl,
            storage_path: `project-photos/${storagePath}`,
          });

          useProjectWizardStore.getState().updatePhoto(photo.id, {
            status: 'done',
            url: publicUrl,
            progress: 100,
          });
        }

        const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
          'analyze-photos',
          { body: { project_id: pid, photo_urls: photoUrls } }
        );
        if (analysisError) {
          let msg = analysisError.message;
          try {
            const body = await (analysisError.context as Response).clone().json();
            if (body?.error) msg = body.error;
          } catch {}
          throw new Error(msg);
        }

        setAnalysisResult(analysisData.analysis);

        const { data: questionnaireData, error: questionnaireError } = await supabase.functions.invoke(
          'generate-questionnaire',
          { body: { project_id: pid, analysis: analysisData.analysis } }
        );
        if (questionnaireError) {
          let msg = questionnaireError.message;
          try {
            const body = await (questionnaireError.context as Response).clone().json();
            if (body?.error) msg = body.error;
          } catch {}
          throw new Error(msg);
        }

        setQuestions(questionnaireData.questions);
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
