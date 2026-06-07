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
import { restartProjectDispatch } from '@/lib/project-dispatch';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

export default function ConfirmStep() {
  const navigation = useNavigation<any>();
  const { projectId, address, coordinates, reset } = useProjectWizardStore();
  const [loading, setLoading] = useState(false);

  const handleDispatch = async () => {
    if (!projectId) {
      Alert.alert('Project missing', 'Go back and finish the project brief before dispatching.');
      return;
    }

    if (!address || !coordinates) {
      Alert.alert('Project address required', 'Add the project address before dispatching to nearby contractors.', [
        { text: 'Add Address', onPress: () => navigation.navigate('Address') },
      ]);
      return;
    }

    setLoading(true);
    try {
      const dispatchData = await restartProjectDispatch(projectId, 1);
      if (!dispatchData?.success) {
        throw new Error(dispatchData?.message ?? 'No matching contractors were found for this project.');
      }

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
            {Array.from({ length: 8 }, (_, i) => (
              <View key={i} style={[styles.progressSeg, styles.progressSegActive]} />
            ))}
          </View>

          <View style={styles.content}>
            <View style={styles.iconWrap}>
              <Ionicons name="rocket-outline" size={52} color={Colors.accent} />
            </View>
            <Text style={styles.stepLabel}>STEP 8 OF 8</Text>
            <Text style={styles.title}>Ready to dispatch</Text>
            <Text style={styles.subtitle}>
              Your project brief is ready. Our AI will identify the{' '}
              <Text style={styles.highlight}>required trades</Text>{' '}
              and notify verified specialists in your area for each one.
            </Text>

            <GlassCard style={styles.card}>
              {([
                { icon: 'location-outline', label: 'LOCATION', value: address ?? 'Not set' },
                { icon: 'time-outline', label: 'RESPONSE WINDOW', value: '2 hours' },
                { icon: 'trophy-outline', label: 'HOW IT WORKS', value: 'Each trade slot is filled independently — first qualified contractor per trade wins' },
                { icon: 'card-outline', label: 'PAYMENT', value: "You'll be notified when a contractor submits a quote \u2014 pay only after reviewing it" },
              ] as { icon: string; label: string; value: string }[]).map((item, i) => (
                <View key={i} style={[styles.infoRow, i < 3 && styles.infoRowBorder]}>
                  <Ionicons name={item.icon} size={20} color={Colors.text.secondary} style={styles.infoIcon} />
                  <View style={styles.infoBody}>
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
  stepLabel: { ...Typography.label, color: Colors.success, textAlign: 'center', marginBottom: 8 },
  title: { ...Typography.h1, textAlign: 'center', marginBottom: 12 },
  subtitle: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  highlight: { color: Colors.accent, fontWeight: '700' },
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
  infoBody: { flex: 1 },
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
