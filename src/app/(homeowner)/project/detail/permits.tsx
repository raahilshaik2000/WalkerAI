import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { PERMITS } from '@/components/dashboard/projectDetailData';

const STEPS = ['Not Applied', 'Applied', 'Approved', 'Inspection', 'Passed'];
const STEP_COLORS = ['#6B6B6B', '#F59E0B', '#60A5FA', '#A78BFA', '#22C55E'];

export default function DetailPermitsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = route.params?.projectId ?? 'f1';
  const permits = PERMITS[projectId] ?? [];

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Permits</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {permits.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shield-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No permits required</Text>
              <Text style={styles.emptySub}>Permits will appear here when your contractor applies for them.</Text>
            </View>
          ) : (
            permits.map((permit) => (
              <GlassCard key={permit.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.permitType}>{permit.type}</Text>
                  <View style={[styles.statusPill, { backgroundColor: STEP_COLORS[permit.statusStep] + '22' }]}>
                    <Text style={[styles.statusText, { color: STEP_COLORS[permit.statusStep] }]}>
                      {STEPS[permit.statusStep]}
                    </Text>
                  </View>
                </View>

                {/* Progress steps */}
                <View style={styles.stepsRow}>
                  {STEPS.map((step, i) => (
                    <View key={step} style={styles.step}>
                      <View style={[styles.stepDot, { backgroundColor: i <= permit.statusStep ? STEP_COLORS[permit.statusStep] : Colors.surface.border }]} />
                      {i < STEPS.length - 1 && (
                        <View style={[styles.stepLine, { backgroundColor: i < permit.statusStep ? STEP_COLORS[permit.statusStep] : Colors.surface.border }]} />
                      )}
                    </View>
                  ))}
                </View>
                <View style={styles.stepsLabels}>
                  {STEPS.map((step, i) => (
                    <Text key={step} style={[styles.stepLabel, i <= permit.statusStep && { color: '#fff' }]}>
                      {step}
                    </Text>
                  ))}
                </View>
              </GlassCard>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center' },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  permitType: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  statusText: { fontSize: 10, fontWeight: '700' },
  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { flex: 1, height: 2 },
  stepsLabels: { flexDirection: 'row' },
  stepLabel: { flex: 1, fontSize: 9, color: Colors.text.tertiary, textAlign: 'center' },
});
