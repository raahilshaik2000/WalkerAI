import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

export default function ConfirmStep() {
  const navigation = useNavigation<any>();
  const { projectId, address, reset } = useProjectWizardStore();
  const [loading, setLoading] = useState(false);

  const handleDispatch = async () => {
    setLoading(true);
    try {
      // Trigger dispatch-job edge function
      const { error } = await supabase.functions.invoke('dispatch-job', {
        body: { project_id: projectId },
      });
      if (error) throw error;

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      reset(); // Clear wizard state
      navigation.reset({ index: 0, routes: [{ name: 'HomeownerTabs' }] });
    } catch (err) {
      Alert.alert('Dispatch failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          {/* Progress */}
          <View style={styles.progressRow}>
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={[styles.progressSeg, styles.progressSegActive]} />
            ))}
          </View>

          <View style={styles.content}>
            <Text style={styles.icon}>🚀</Text>
            <Text style={styles.title}>Ready to dispatch</Text>
            <Text style={styles.subtitle}>
              Your project brief is ready. We'll notify the{' '}
              <Text style={{ color: Colors.accent, fontWeight: '700' }}>10 nearest verified contractors</Text>{' '}
              and the first to accept wins the job.
            </Text>

            <GlassCard style={styles.card}>
              {[
                { icon: '📍', label: 'Location', value: address ?? 'Not set' },
                { icon: '⏱', label: 'Response window', value: '2 hours' },
                { icon: '🏆', label: 'How it works', value: 'First contractor to accept gets the job' },
                { icon: '💳', label: 'Payment', value: "You'll be notified when to pay \u2014 only after a contractor is assigned" },
              ].map((item, i) => (
                <View key={i} style={[styles.infoRow, i < 3 && styles.infoRowBorder]}>
                  <Text style={styles.infoIcon}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{item.label}</Text>
                    <Text style={styles.infoValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </GlassCard>

            <GlassButton
              label="Send to Contractors"
              onPress={handleDispatch}
              loading={loading}
              fullWidth
              size="lg"
              haptic
              style={styles.cta}
            />

            <Text style={styles.disclaimer}>
              By dispatching, you agree to WalkerAI's Terms of Service. A contractor has 2 hours to accept before we search a wider area.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  progressRow: { flexDirection: 'row', gap: 5, marginBottom: Spacing.lg },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.glass.surface },
  progressSegActive: { backgroundColor: Colors.success },
  content: { flex: 1, justifyContent: 'center' },
  icon: { fontSize: 56, textAlign: 'center', marginBottom: Spacing.md },
  title: { ...Typography.h1, textAlign: 'center', marginBottom: 12 },
  subtitle: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  card: { marginBottom: Spacing.md },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  infoIcon: { fontSize: 20, marginTop: 1 },
  infoLabel: { ...Typography.label, marginBottom: 3 },
  infoValue: { ...Typography.body },
  cta: { marginBottom: Spacing.sm },
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
    lineHeight: 18,
  },
});
