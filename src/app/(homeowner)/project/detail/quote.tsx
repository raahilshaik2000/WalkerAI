import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { QUOTES } from '@/components/dashboard/projectDetailData';

export default function DetailQuoteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = route.params?.projectId ?? 'f1';
  const quote = QUOTES[projectId];

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Quote</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {!quote ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No quote yet</Text>
              <Text style={styles.emptySub}>Quotes will appear here once contractors submit bids.</Text>
            </View>
          ) : (
            <>
              {/* Contractor */}
              <GlassCard style={styles.contractorCard}>
                <View style={styles.contractorRow}>
                  <Image source={{ uri: quote.contractorAvatar }} style={styles.avatar} />
                  <View style={styles.contractorInfo}>
                    <Text style={styles.contractorName}>{quote.contractorName}</Text>
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.ratingText}>{quote.rating} ({quote.reviewCount} reviews)</Text>
                    </View>
                  </View>
                  {quote.status === 'approved' && (
                    <View style={styles.approvedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
                      <Text style={styles.approvedText}>Approved</Text>
                    </View>
                  )}
                </View>
              </GlassCard>

              {/* Total */}
              <GlassCard style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total Project Cost</Text>
                <Text style={styles.totalAmount}>${quote.totalAmount.toLocaleString()}</Text>
                <Text style={styles.escrowNote}>
                  <Ionicons name="shield-checkmark-outline" size={12} color={Colors.text.tertiary} />
                  {' '}Funds held in escrow until milestones are approved
                </Text>
              </GlassCard>

              {/* Milestones breakdown */}
              <Text style={styles.sectionTitle}>Payment Milestones</Text>
              <GlassCard padding={0}>
                {quote.milestones.map((m, i) => (
                  <View key={i}>
                    <View style={styles.milestoneRow}>
                      <View style={styles.numCircle}>
                        <Text style={styles.numText}>{i + 1}</Text>
                      </View>
                      <View style={styles.milestoneInfo}>
                        <Text style={styles.milestoneTitle}>{m.title}</Text>
                        <Text style={styles.milestoneDue}>{m.dueDate}</Text>
                      </View>
                      <Text style={styles.milestoneAmount}>${m.amount.toLocaleString()}</Text>
                    </View>
                    {i < quote.milestones.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </GlassCard>

              {quote.status === 'pending' && (
                <GlassButton
                  label="Approve & Pay"
                  onPress={() => Alert.alert('Approve Quote', `Approve $${quote.totalAmount.toLocaleString()} quote?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Approve', onPress: () => Alert.alert('Quote Approved', 'Payment has been initiated.') },
                  ])}
                  variant="primary"
                  fullWidth
                  haptic
                  size="lg"
                  style={{ marginTop: Spacing.md }}
                  icon={<Ionicons name="card-outline" size={18} color="#000" />}
                />
              )}
            </>
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
  contractorCard: { marginBottom: 12 },
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  contractorInfo: { flex: 1 },
  contractorName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { fontSize: 12, color: Colors.text.tertiary },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill },
  approvedText: { fontSize: 11, fontWeight: '600', color: '#22C55E' },
  totalCard: { marginBottom: Spacing.md, alignItems: 'center' },
  totalLabel: { fontSize: 13, color: Colors.text.tertiary, marginBottom: 4 },
  totalAmount: { fontSize: 36, fontWeight: '700', color: '#fff', marginBottom: 6 },
  escrowNote: { fontSize: 12, color: Colors.text.tertiary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  numCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  milestoneInfo: { flex: 1 },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  milestoneDue: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  milestoneAmount: { fontSize: 14, fontWeight: '700', color: '#fff' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 54 },
});
