import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';

export default function PendingVerificationScreen() {
  return (
    <GradientBackground glow="center">
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.icon}>⏳</Text>
          <Text style={styles.title}>Verification in progress</Text>
          <Text style={styles.subtitle}>
            Our team is reviewing your documents. You'll receive a push notification within 1–2 business days once you're approved.
          </Text>

          <GlassCard style={styles.card}>
            {[
              { icon: '✅', text: 'Business info submitted' },
              { icon: '✅', text: 'License on file' },
              { icon: '✅', text: 'Insurance documents uploaded' },
              { icon: '🔍', text: 'Under review by WalkerAI' },
            ].map((item, i) => (
              <View key={i} style={styles.checkRow}>
                <Text style={styles.checkIcon}>{item.icon}</Text>
                <Text style={styles.checkText}>{item.text}</Text>
              </View>
            ))}
          </GlassCard>

          <Text style={styles.note}>
            Questions? Email{' '}
            <Text style={{ color: Colors.accent }}>support@walkerai.ca</Text>
          </Text>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  icon: { fontSize: 56, marginBottom: Spacing.md },
  title: { ...Typography.h1, textAlign: 'center', marginBottom: 12 },
  subtitle: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  card: { width: '100%', marginBottom: Spacing.lg },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  checkIcon: { fontSize: 18 },
  checkText: { ...Typography.body },
  note: { ...Typography.caption, textAlign: 'center' },
});
