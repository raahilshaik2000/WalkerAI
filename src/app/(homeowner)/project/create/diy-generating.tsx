import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { uploadBase64 } from '@/lib/supabase/storage';
import { useDIYWizardStore } from '@/stores/diy-wizard.store';
import { useAuthStore } from '@/stores/auth.store';
import { GradientBackground } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';

const STEPS = [
  'Uploading your photos…',
  'Analyzing the area…',
  'Identifying materials & issues…',
  'Calculating tools needed…',
  'Building your step-by-step guide…',
  'Assembling materials list…',
  'Finalizing your guide…',
];

export default function DIYGeneratingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const store = useDIYWizardStore();

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
    const interval = setInterval(() => setCurrentStep((p) => (p + 1) % STEPS.length), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        await supabase.auth.refreshSession();
        // 1. Create project in DB
        const { data: project, error: createErr } = await supabase
          .from('projects')
          .insert({
            homeowner_id: user!.id,
            room_type: store.category ?? 'general',
            status: 'draft',
            description: store.description,
          })
          .select('id')
          .single();
        if (createErr) throw new Error(`Project creation failed: ${createErr.message}`);
        const pid = project.id;
        store.setProjectId(pid);

        // 2. Upload photos via base64
        const photoUrls: string[] = [];
        for (const photo of store.photos.filter((p) => p.status === 'done')) {
          const base64 = store.photoBase64s[photo.id];
          if (!base64) continue;
          const storagePath = `${pid}/diy_${photo.id}.jpg`;
          const { publicUrl } = await uploadBase64('project-photos', storagePath, base64);
          photoUrls.push(publicUrl);
          // Silently track photo — non-fatal if this fails
          supabase.from('project_photos').insert({
            project_id: pid,
            url: publicUrl,
            storage_path: storagePath,
          }).then(({ error }) => {
            if (error) console.warn('project_photos insert failed (non-fatal):', error.message);
          });
        }
        if (photoUrls.length === 0) throw new Error('No photos could be uploaded.');

        // 3. Call edge function
        const { data, error: fnErr } = await supabase.functions.invoke('generate-diy-guide', {
          body: {
            project_id: pid,
            photo_urls: photoUrls,
            description: store.description,
            category: store.category,
            budget_min: store.budgetMin,
            budget_max: store.budgetMax,
            skill_level: store.skillLevel,
            tools_available: store.toolsAvailable,
            timeline: store.timeline,
          },
        });

        if (fnErr) {
          let msg = fnErr.message;
          try {
            const b = await (fnErr.context as Response).clone().json();
            if (b?.error) msg = b.error;
            else if (b?.message) msg = b.message;
            else msg = JSON.stringify(b);
          } catch {
            try {
              const txt = await (fnErr.context as Response).clone().text();
              if (txt) msg = txt.slice(0, 300);
            } catch {}
          }
          throw new Error(`Function error: ${msg}`);
        }

        store.setGuide(data.guide);
        navigation.replace('DIYGuide');
      } catch (err: any) {
        setError(err?.message || String(err));
      }
    };
    run();
  }, []);

  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (error) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <View style={styles.errorCircle}>
              <Ionicons name="alert-circle-outline" size={48} color="#FF6B00" />
            </View>
            <Text style={styles.errorTitle}>Guide generation failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity
              style={styles.errorBackBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.errorBackText}>← Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.center, { opacity: opacityAnim }]}>
          <View style={styles.ringContainer}>
            <Animated.View style={[styles.ring, styles.ringOuter, { transform: [{ scale: pulseAnim }] }]} />
            <Animated.View style={[styles.ring, styles.ringMid, { transform: [{ scale: pulseAnim }] }]} />
            <Animated.View style={[styles.spinArc, { transform: [{ rotate: spin }] }]}>
              <View style={styles.spinDot} />
            </Animated.View>
            <View style={styles.core}>
              <Ionicons name="hammer" size={32} color="#FF6B00" />
            </View>
          </View>
          <Text style={styles.headline}>Building your guide</Text>
          <Text style={styles.stepText}>{STEPS[currentStep]}</Text>
          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentStep && styles.dotActive]} />
            ))}
          </View>
        </Animated.View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  ringContainer: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg, position: 'relative' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  ringOuter: { width: 180, height: 180, borderColor: 'rgba(255, 107, 0, 0.2)' },
  ringMid: { width: 130, height: 130, borderColor: 'rgba(255, 107, 0, 0.35)' },
  spinArc: { position: 'absolute', width: 180, height: 180, alignItems: 'center', justifyContent: 'flex-start' },
  spinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6B00', marginTop: 2 },
  core: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255, 107, 0, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 107, 0, 0.3)', alignItems: 'center', justifyContent: 'center' },
  headline: { ...Typography.h2, textAlign: 'center', marginBottom: 12 },
  stepText: { ...Typography.bodySecondary, textAlign: 'center', marginBottom: Spacing.lg, minHeight: 24 },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.glass.border },
  dotActive: { backgroundColor: '#FF6B00' },
  errorCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,107,0,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  errorTitle: { ...Typography.h2, marginBottom: 10, textAlign: 'center' },
  errorBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  errorBackBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,107,0,0.4)', backgroundColor: 'rgba(255,107,0,0.08)' },
  errorBackText: { color: '#FF6B00', fontSize: 15, fontWeight: '600' },
});
