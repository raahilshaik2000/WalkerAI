import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

export default function SupplierPendingVerification() {
  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.iconWrap}>
            <Ionicons name="time-outline" size={56} color={Colors.accent} />
          </View>
          <Text style={styles.title}>Under Review</Text>
          <Text style={styles.body}>
            Your supplier application has been submitted. Our team will verify your business details and activate your account within 1–2 business days.
          </Text>
          <Text style={styles.body}>
            You'll receive a notification as soon as you're approved and can start fulfilling material orders.
          </Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>What happens next?</Text>
            <View style={styles.step}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#34D399" />
              <Text style={styles.stepText}>Application submitted</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="time-outline" size={18} color={Colors.accent} />
              <Text style={styles.stepText}>Team reviews your license & info</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="notifications-outline" size={18} color={Colors.text.secondary} />
              <Text style={styles.stepText}>You get notified when approved</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="storefront-outline" size={18} color={Colors.text.secondary} />
              <Text style={styles.stepText}>Start receiving material orders</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: 60, alignItems: 'center' },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,107,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: { ...Typography.h1, marginBottom: Spacing.md, textAlign: 'center' },
  body: { ...Typography.bodySecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 22 },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: 14,
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepText: { fontSize: 14, color: Colors.text.secondary },
});
