import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { CHANGE_ORDERS, FakeChangeOrder } from '@/components/dashboard/projectDetailData';

export default function DetailChangeOrdersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = route.params?.projectId ?? 'f1';
  const orders = CHANGE_ORDERS[projectId] ?? [];

  const handleApprove = (co: FakeChangeOrder) => {
    Alert.alert('Approve Change', `Approve +$${co.costDelta.toLocaleString()} change?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve & Sign', onPress: () => Alert.alert('Change Approved', 'The change order has been signed.') },
    ]);
  };

  const handleReject = (co: FakeChangeOrder) => {
    Alert.alert('Reject Change', 'Are you sure you want to reject this change order?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => Alert.alert('Change Rejected') },
    ]);
  };

  const statusColor = (s: string) => s === 'approved' ? '#22C55E' : s === 'rejected' ? '#EF4444' : '#F59E0B';

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Change Orders</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {orders.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="swap-horizontal-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No change orders</Text>
              <Text style={styles.emptySub}>Change orders from your contractor will appear here.</Text>
            </View>
          ) : (
            orders.map((co) => (
              <GlassCard key={co.id} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={[styles.statusPill, { backgroundColor: statusColor(co.status) + '22' }]}>
                    <Text style={[styles.statusText, { color: statusColor(co.status) }]}>
                      {co.status.charAt(0).toUpperCase() + co.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.date}>{co.createdAt}</Text>
                </View>

                <Text style={styles.description}>{co.description}</Text>

                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Cost Adjustment</Text>
                  <Text style={[styles.costAmount, { color: co.costDelta > 0 ? '#F59E0B' : '#22C55E' }]}>
                    {co.costDelta > 0 ? '+' : ''}${co.costDelta.toLocaleString()}
                  </Text>
                </View>

                {/* Signatures */}
                <View style={styles.sigRow}>
                  <View style={styles.sigItem}>
                    <Ionicons name={co.contractorSigned ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={co.contractorSigned ? '#22C55E' : Colors.text.tertiary} />
                    <Text style={styles.sigText}>Contractor</Text>
                  </View>
                  <View style={styles.sigItem}>
                    <Ionicons name={co.homeownerSigned ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={co.homeownerSigned ? '#22C55E' : Colors.text.tertiary} />
                    <Text style={styles.sigText}>You</Text>
                  </View>
                </View>

                {co.status === 'proposed' && !co.homeownerSigned && (
                  <View style={styles.actions}>
                    <GlassButton label="Approve & Sign" onPress={() => handleApprove(co)} variant="primary" size="sm" haptic fullWidth />
                    <GlassButton label="Reject" onPress={() => handleReject(co)} variant="destructive" size="sm" haptic fullWidth style={{ marginTop: 8 }} />
                  </View>
                )}
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  statusText: { fontSize: 10, fontWeight: '700' },
  date: { fontSize: 12, color: Colors.text.tertiary },
  description: { fontSize: 14, color: '#fff', lineHeight: 20, marginBottom: 12 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, backgroundColor: Colors.surface.hover, borderRadius: Radius.sm, padding: 10 },
  costLabel: { fontSize: 13, color: Colors.text.secondary },
  costAmount: { fontSize: 16, fontWeight: '700' },
  sigRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  sigItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sigText: { fontSize: 12, color: Colors.text.secondary },
  actions: { marginTop: 4 },
});
