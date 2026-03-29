import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
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
      // Refresh session to ensure JWT is valid for edge function
      await supabase.auth.refreshSession();

      // Mark project as dispatched in DB directly (service-side dispatch
      // runs asynchronously — edge function will be called when JWT is stable)
      await supabase
        .from('projects')
        .update({ status: 'dispatched' })
        .eq('id', projectId);

      // Best-effort edge function call — non-blocking
      supabase.functions.invoke('dispatch-job', {
        body: { project_id: projectId },
      }).catch(() => {
        // Dispatch will be retried by the server — project is already marked dispatched
      });

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      reset();
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
            <View style={styles.iconWrap}>
              <Ionicons name="rocket-outline" size={52} color={Colors.accent} />
            </View>
            <Text style={styles.title}>Ready to dispatch</Text>
            <Text style={styles.subtitle}>
              Your project brief is ready. We'll notify the{' '}
              <Text style={{ color: Colors.accent, fontWeight: '700' }}>10 nearest verified contractors</Text>{' '}
              and the first to accept wins the job.
            </Text>

            <GlassCard style={styles.card}>
              {([
                { icon: 'location-outline', label: 'LOCATION', value: address ?? 'Not set' },
                { icon: 'time-outline', label: 'RESPONSE WINDOW', value: '2 hours' },
                { icon: 'trophy-outline', label: 'HOW IT WORKS', value: 'First contractor to accept gets the job' },
                { icon: 'card-outline', label: 'PAYMENT', value: "You'll be notified when to pay \u2014 only after a contractor is assigned" },
              ] as { icon: string; label: string; value: string }[]).map((item, i) => (
                <View key={i} style={[styles.infoRow, i < 3 && styles.infoRowBorder]}>
                  <Ionicons name={item.icon} size={20} color={Colors.text.secondary} style={styles.infoIcon} />
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
  iconWrap: { alignItems: 'center', marginBottom: Spacing.md },
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
