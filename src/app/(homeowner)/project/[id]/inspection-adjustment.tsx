import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatSignedCadCents } from '@/lib/currency';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import type { SiteInspectionAdjustment } from '@/types/database.types';

export default function HomeownerInspectionAdjustmentScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [adjustments, setAdjustments] = useState<SiteInspectionAdjustment[]>([]);
  const [_loading, setLoading] = useState(true);
  const [fundingId, setFundingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchAdjustments = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    if (!projectId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('site_inspection_adjustments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdjustments((data ?? []) as SiteInspectionAdjustment[]);
      hasLoadedRef.current = true;
    } catch (err) {
      console.warn('Could not load site inspection adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  async function handleFundAdjustment(adj: SiteInspectionAdjustment) {
    setFundingId(adj.id);
    try {
      // 1. Create payment intent for the site inspection adjustment
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          purpose: 'site_inspection_adjustment',
          adjustment_id: adj.id,
          project_id: projectId,
        },
      });

      if (error || !data?.client_secret) {
        throw new Error(data?.error || error?.message || 'Failed to initialize payment');
      }

      // 2. Initialize Stripe sheet
      const { error: sheetInitError } = await initPaymentSheet({
        paymentIntentClientSecret: data.client_secret,
        merchantDisplayName: 'Walker AI',
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: user?.email ?? undefined },
      });

      if (sheetInitError) throw sheetInitError;

      // 3. Present Stripe payment sheet
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return;
        throw presentError;
      }

      Alert.alert(
        'Price Adjustment Approved & Funded',
        'Thank you. The contract price, supplier materials, and trade schedules have been updated.',
      );
      fetchAdjustments();
    } catch (err: unknown) {
      Alert.alert('Payment Failed', formatAppSafeErrorMessage(err, 'Payment could not be processed.'));
    } finally {
      setFundingId(null);
    }
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Site Inspection Adjustments</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Information Card */}
          <GlassCard style={styles.infoCard} padding={16}>
            <View style={styles.infoRow}>
              <Icon name="shield-check" size={24} color="#10B981" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.infoTitle}>Head Office Verified</Text>
                <Text style={styles.infoBody}>
                  Onsite trade inspections are rigorously reviewed by Walker AI Head Office before reaching you. Work proceeds only once agreed and funded.
                </Text>
              </View>
            </View>
          </GlassCard>

          {adjustments.length === 0 ? (
            <GlassCard style={styles.emptyCard} padding={24}>
              <Text style={styles.emptyText}>No site inspection adjustments for this project.</Text>
            </GlassCard>
          ) : (
            adjustments.map((adj) => {
              const isAwaitingFunding = adj.status === 'awaiting_homeowner_funding';
              const isApprovedFunded = adj.status === 'approved_and_funded';
              const isCredited = adj.status === 'credited';

              return (
                <GlassCard key={adj.id} style={styles.card} padding={18}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tradeTag}>{adj.trade_type.toUpperCase()} • {adj.reason_category.replace(/_/g, ' ').toUpperCase()}</Text>
                      <Text style={styles.desc}>{adj.description}</Text>
                    </View>
                    <StatusBadge
                      variant={isApprovedFunded || isCredited ? 'completed' : adj.status.includes('reject') ? 'error' : 'pending'}
                      label={adj.status.replace(/_/g, ' ')}
                    />
                  </View>

                  {/* Evidence image preview */}
                  {Array.isArray(adj.evidence_urls) && adj.evidence_urls.length > 0 && adj.evidence_urls[0] && (
                    <View style={styles.evidenceBox}>
                      <Text style={styles.evidenceLabel}>Site Evidence:</Text>
                      <Image source={{ uri: adj.evidence_urls[0] }} style={styles.evidenceImg} />
                    </View>
                  )}

                  {/* Head Office Review Badge */}
                  {adj.head_office_reviewed_at && (
                    <View style={styles.reviewBadge}>
                      <Icon name="check-decagram" size={16} color="#06B6D4" />
                      <Text style={styles.reviewBadgeText}>Approved by Walker AI Head Office</Text>
                    </View>
                  )}

                  {adj.head_office_notes ? (
                    <Text style={styles.notesText}>Note: {adj.head_office_notes}</Text>
                  ) : null}

                  {/* Itemized summary */}
                  <View style={styles.breakdownBox}>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Total Adjustment Amount:</Text>
                      <Text style={[styles.rowValue, adj.cost_delta >= 0 ? styles.amberText : styles.greenText]}>
                        {formatSignedCadCents(adj.cost_delta)}
                      </Text>
                    </View>

                    {adj.schedule_impact_days !== 0 && (
                      <View style={styles.row}>
                        <Text style={styles.rowLabel}>Schedule Impact:</Text>
                        <Text style={styles.rowValue}>
                          {adj.schedule_impact_days > 0 ? `+${adj.schedule_impact_days} days` : `${adj.schedule_impact_days} days`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action button if awaiting homeowner funding */}
                  {isAwaitingFunding && adj.cost_delta > 0 && (
                    <GlassButton
                      label={fundingId === adj.id ? 'Processing...' : `Approve & Fund ${formatSignedCadCents(adj.cost_delta)}`}
                      variant="primary"
                      onPress={() => handleFundAdjustment(adj)}
                      disabled={fundingId === adj.id}
                      style={styles.fundBtn}
                    />
                  )}

                  {isCredited && (
                    <View style={styles.creditBanner}>
                      <Icon name="check-circle" size={16} color="#10B981" />
                      <Text style={styles.creditText}>Credit of {formatSignedCadCents(Math.abs(adj.cost_delta))} applied to your project balance.</Text>
                    </View>
                  )}
                </GlassCard>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { padding: 4 },
  title: { ...Typography.h2, color: Colors.text.primary },
  scroll: { padding: Spacing.md, paddingBottom: 40 },
  infoCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: Spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoTitle: { ...Typography.h3, color: '#10B981', marginBottom: 4 },
  infoBody: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },
  emptyCard: { alignItems: 'center' },
  emptyText: { ...Typography.caption, color: Colors.text.secondary },
  card: { marginBottom: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  tradeTag: { ...Typography.caption, color: '#FF6B00', fontWeight: '700', marginBottom: 2 },
  desc: { ...Typography.body, color: Colors.text.primary },
  evidenceBox: { marginVertical: 10 },
  evidenceLabel: { ...Typography.caption, color: Colors.text.secondary, marginBottom: 4 },
  evidenceImg: { width: '100%', height: 160, borderRadius: Radius.sm, backgroundColor: '#111' },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  reviewBadgeText: { ...Typography.caption, color: '#06B6D4', marginLeft: 6, fontWeight: '600' },
  notesText: { ...Typography.caption, color: Colors.text.secondary, fontStyle: 'italic', marginBottom: 6 },
  breakdownBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: Radius.sm,
    marginVertical: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  rowLabel: { ...Typography.caption, color: Colors.text.secondary },
  rowValue: { ...Typography.caption, fontWeight: '700', color: Colors.text.primary },
  amberText: { color: '#FF6B00' },
  greenText: { color: '#10B981' },
  fundBtn: { marginTop: Spacing.sm },
  creditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 10,
    borderRadius: Radius.sm,
    marginTop: 8,
  },
  creditText: { ...Typography.caption, color: '#10B981', marginLeft: 8, fontWeight: '600' },
});
