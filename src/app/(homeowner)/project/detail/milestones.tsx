import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { MILESTONES, FakeMilestone } from '@/components/dashboard/projectDetailData';

export default function DetailMilestonesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = route.params?.projectId ?? 'f1';
  const milestones = MILESTONES[projectId] ?? [];

  const total = milestones.reduce((s, m) => s + m.amount, 0);
  const paid = milestones.filter((m) => m.status === 'completed').reduce((s, m) => s + m.amount, 0);

  const handleApprove = (m: FakeMilestone) => {
    Alert.alert('Release Payment', `Release $${m.amount.toLocaleString()} for "${m.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => Alert.alert('Payment Released', 'Funds have been released from escrow.') },
    ]);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Milestones</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Escrow bar */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowRow}>
            <Text style={styles.escrowLabel}>Escrow Progress</Text>
            <Text style={styles.escrowAmount}>${paid.toLocaleString()} / ${total.toLocaleString()}</Text>
          </View>
          <View style={styles.escrowBg}>
            <View style={[styles.escrowFill, { width: total > 0 ? `${(paid / total) * 100}%` as any : '0%' }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {milestones.map((m, i) => (
            <View key={m.id} style={styles.milestoneCard}>
              <View style={styles.stepRow}>
                <View style={[styles.stepCircle, { backgroundColor: m.statusColor }]}>
                  {m.status === 'completed' ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  )}
                </View>
                {i < milestones.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: m.status === 'completed' ? '#22C55E' : Colors.surface.border }]} />
                )}
              </View>
              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{m.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: m.statusColor + '22' }]}>
                    <Text style={[styles.statusText, { color: m.statusColor }]}>
                      {m.status === 'completed' ? 'Paid' : m.status === 'in_progress' ? 'In Progress' : 'Upcoming'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.description}>{m.description}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.amount}>${m.amount.toLocaleString()}</Text>
                  <Text style={styles.dueDate}>
                    <Ionicons name="calendar-outline" size={11} color={Colors.text.tertiary} /> {m.dueDate}
                  </Text>
                </View>
                {m.status === 'in_progress' && (
                  <GlassButton
                    label="Approve & Release Payment"
                    onPress={() => handleApprove(m)}
                    variant="primary"
                    fullWidth
                    size="sm"
                    haptic
                    style={{ marginTop: 12 }}
                  />
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  escrowCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.surface.default, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.surface.border, padding: 14 },
  escrowRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  escrowLabel: { fontSize: 13, color: Colors.text.secondary },
  escrowAmount: { fontSize: 13, fontWeight: '700', color: '#fff' },
  escrowBg: { height: 6, borderRadius: 3, backgroundColor: Colors.surface.border },
  escrowFill: { height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  milestoneCard: { flexDirection: 'row', marginBottom: 4 },
  stepRow: { alignItems: 'center', width: 32, marginRight: 12 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#fff' },
  stepLine: { width: 2, flex: 1, minHeight: 60, marginVertical: 4 },
  cardBody: { flex: 1, backgroundColor: Colors.surface.default, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.surface.border, padding: 14, marginBottom: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1, marginRight: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  statusText: { fontSize: 10, fontWeight: '700' },
  description: { fontSize: 13, color: Colors.text.tertiary, lineHeight: 18, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 14, fontWeight: '700', color: '#fff' },
  dueDate: { fontSize: 12, color: Colors.text.tertiary },
});
