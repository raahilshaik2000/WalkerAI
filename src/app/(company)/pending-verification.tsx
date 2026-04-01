import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';

const STEPS = [
  { icon: 'check-circle', color: Colors.success, text: 'Business info submitted' },
  { icon: 'check-circle', color: Colors.success, text: 'License on file' },
  { icon: 'check-circle', color: Colors.success, text: 'Insurance documents uploaded' },
  { icon: 'magnify', color: Colors.warning, text: 'Under review by WalkerAI' },
];

export default function PendingVerificationScreen() {
  return (
    <GradientBackground glow="center">
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Icon name="clock-check-outline" size={40} color={Colors.warning} />
          </View>
          <Text style={styles.title}>Verification in progress</Text>
          <Text style={styles.subtitle}>
            Our team is reviewing your documents. You'll receive a push notification within 1–2 business days once you're approved.
          </Text>

          <GlassCard style={styles.card}>
            {STEPS.map((item, i) => (
              <View key={i} style={styles.checkRow}>
                <Icon name={item.icon} size={18} color={item.color} />
                <Text style={styles.checkText}>{item.text}</Text>
              </View>
            ))}
          </GlassCard>

          <Text style={styles.note}>
            Questions? Email{' '}
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:support@walkerai.ca')}>
            <Text style={styles.emailLink}>support@walkerai.ca</Text>
          </TouchableOpacity>
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
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
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
  checkText: { ...Typography.body },
  note: { ...Typography.caption, textAlign: 'center' },
  emailLink: { color: Colors.accent, fontSize: 13, fontWeight: '600', marginTop: 4 },
});
