import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents } from '@/lib/currency';
import { averageCostCents } from '@/lib/master-quote';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { getPaymentSheetConfig } from '@/lib/payments';
import { formatTradeLabel } from '@/lib/trade-labels';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useHomeownerProjectQuote } from '@/lib/homeowner-data';
import { CardSkeleton, GlassCard, GradientBackground } from '@/components/ui';
import { openInAppBrowser } from '@/lib/in-app-browser';

function formatCad(cents: number) {
  return formatCadCents(cents);
}

export default function CostBreakdownScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [paying, setPaying] = useState(false);
  const hasFocusedOnce = useRef(false);

  const quoteQuery = useHomeownerProjectQuote(projectId ?? undefined);
  const project = quoteQuery.data?.project ?? null;
  const masterSlots = quoteQuery.data?.slots ?? [];
  const showSkeleton = !!projectId && !quoteQuery.data && quoteQuery.isLoading;
  const errorMessage = !projectId
    ? 'Project is missing. Reopen the project breakdown from the project page.'
    : quoteQuery.error
      ? formatAppSafeErrorMessage(quoteQuery.error, 'Could not load project breakdown.')
      : null;

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      void quoteQuery.refetch();
    }, [quoteQuery])
  );

  const handlePayMaster = async (masterTotal: number) => {
    Alert.alert(
      'Confirm Payment',
      `Pay ${formatCad(masterTotal)} to WalkerAI to start your project? Funds are held securely in escrow and released to each trade only after you approve their completed work.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPaying(true);
            try {
              const { data, error } = await supabase.functions.invoke('create-payment-intent', {
                body: { project_id: projectId },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));
              const paymentSheetConfig = getPaymentSheetConfig(data);

              const { error: initErr } = await initPaymentSheet({
                paymentIntentClientSecret: paymentSheetConfig.clientSecret,
                merchantDisplayName: 'WalkerAI',
              });
              if (initErr) throw new Error(initErr.message);

              const { error: payErr } = await presentPaymentSheet();
              if (payErr) {
                if (payErr.code === 'Canceled') return;
                throw new Error(payErr.message || 'Payment was not completed.');
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await quoteQuery.refetch();
              setTimeout(() => { void quoteQuery.refetch(); }, 1500);
              setTimeout(() => { void quoteQuery.refetch(); }, 4000);
              Alert.alert(
                'Payment submitted',
                'Your card was charged. Escrow funding usually confirms within a few seconds — pull to refresh if the project still shows unpaid.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert(
                'Payment failed',
                await formatSupabaseFunctionError(
                  err,
                  'Payment could not be completed. Check your connection and card details, then try again.',
                ),
              );
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  const handlePayQuote = async (quoteId: string, quoteTotal: number) => {
    Alert.alert(
      'Confirm Escrow Funding',
      `Pay ${formatCad(quoteTotal)} to WalkerAI to fund this quote in Stripe Escrow? Funds are released to your contractor only after you approve each completed milestone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPaying(true);
            try {
              const { data, error } = await supabase.functions.invoke('create-payment-intent', {
                body: { project_id: projectId, quote_id: quoteId },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));
              const paymentSheetConfig = getPaymentSheetConfig(data);

              const { error: initErr } = await initPaymentSheet({
                paymentIntentClientSecret: paymentSheetConfig.clientSecret,
                merchantDisplayName: 'WalkerAI',
              });
              if (initErr) throw new Error(initErr.message);

              const { error: payErr } = await presentPaymentSheet();
              if (payErr) {
                if (payErr.code === 'Canceled') return;
                throw new Error(payErr.message || 'Payment was not completed.');
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await quoteQuery.refetch();
              setTimeout(() => { void quoteQuery.refetch(); }, 1500);
              setTimeout(() => { void quoteQuery.refetch(); }, 4000);
              Alert.alert(
                'Payment submitted',
                'Your card was charged. Escrow funding usually confirms within a few seconds — pull to refresh if the project still shows unpaid.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert(
                'Payment failed',
                await formatSupabaseFunctionError(
                  err,
                  'Payment could not be completed. Check your connection and card details, then try again.',
                ),
              );
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenFinancing = async () => {
    const url = 'https://aristothemortgageman.ca/renovation-equity-checker';
    await openInAppBrowser(url);
  };

  if (showSkeleton) {
    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Breakdown</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.center}>
            <CardSkeleton style={{ width: '90%' }} />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (errorMessage) {
    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Breakdown</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={42} color={Colors.text.tertiary} />
            <Text style={[Typography.h3, { marginTop: 12 }]}>Could not load project breakdown</Text>
            <Text style={[Typography.bodySecondary, styles.errorText]}>{errorMessage}</Text>
            <TouchableOpacity
              style={[styles.payCta, { paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 }]}
              onPress={() => void quoteQuery.refetch()}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color="#000" />
              <Text style={styles.payCtaText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const masterTotal = project && project.master_total_cents && project.master_total_cents > 0
    ? project.master_total_cents
    : (project?.ai_cost_min != null && project?.ai_cost_max != null
      ? averageCostCents(project.ai_cost_min, project.ai_cost_max)
      : 0);
  const singleTradeJoined = masterSlots.length === 0 && !!project?.assigned_company_id;
  const allTradesJoined = (masterSlots.length > 0
    && masterSlots.every((s) => !!s.assigned_company_id && ['filled', 'scheduled'].includes(s.status ?? '')))
    || singleTradeJoined;
  const isFunded = project?.payment_status === 'funded';
  const canPayMaster = !isFunded && allTradesJoined && masterTotal > 0;
  const pendingTrades = masterSlots.filter((s) => !s.assigned_company_id || !['filled', 'scheduled'].includes(s.status ?? '')).length;

  const quotes = quoteQuery.data?.quotes ?? [];
  const pendingQuote = quotes.find((q) => q.status === 'pending') ?? null;
  const approvedQuote = quotes.find((q) => q.status === 'approved') ?? null;
  const activeQuote = pendingQuote ?? approvedQuote ?? (quotes.length > 0 ? quotes[0] : null);
  const canPayQuote = !isFunded && !!pendingQuote && pendingQuote.total_amount > 0;

  return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Breakdown</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Master price */}
            <GlassCard style={styles.card}>
              <View style={styles.priceHeader}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,107,0,0.12)' }]}>
                  <Ionicons name="sparkles" size={20} color="#FF6B00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.priceLabel}>AI Project Price</Text>
                  <Text style={styles.priceSubLabel}>Set by WalkerAI from your measurements & materials</Text>
                </View>
              </View>
              <Text style={styles.priceRange}>{masterTotal > 0 ? formatCad(masterTotal) : '—'}</Text>
              {isFunded ? (
                <View style={styles.confirmedRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                  <Text style={styles.confirmedText}>Paid — held in escrow</Text>
                </View>
              ) : allTradesJoined ? (
                <Text style={styles.pendingText}>All trades are ready — pay to start your project</Text>
              ) : (
                <Text style={styles.pendingText}>
                  {pendingTrades} trade{pendingTrades === 1 ? '' : 's'} still joining — you can pay once everyone has accepted
                </Text>
              )}
            </GlassCard>

            {/* Contractor Submitted Quote */}
            {activeQuote && (
              <GlassCard style={styles.card}>
                <View style={styles.priceHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: 'rgba(52, 211, 153, 0.12)' }]}>
                    <Ionicons name="document-text" size={20} color="#34D399" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>
                      {activeQuote.status === 'approved' ? 'Funded Contractor Quote' : 'Contractor Quote Submitted'}
                    </Text>
                    <Text style={styles.priceSubLabel}>
                      {activeQuote.company_name ? `From ${activeQuote.company_name}` : 'From assigned contractor'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.priceRange, { color: '#34D399' }]}>
                  {formatCad(activeQuote.total_amount)}
                </Text>
                {activeQuote.status === 'approved' || isFunded ? (
                  <View style={styles.confirmedRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                    <Text style={styles.confirmedText}>Quote funded — held in escrow</Text>
                  </View>
                ) : (
                  <Text style={styles.pendingText}>
                    Review the line items and payment milestones below before funding escrow.
                  </Text>
                )}

                {/* Line Items */}
                {activeQuote.line_items.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.sectionLabel}>Scope & Line Items</Text>
                    {activeQuote.line_items.map((item, idx) => (
                      <View
                        key={item.id || idx}
                        style={[
                          styles.lineRow,
                          idx < activeQuote.line_items.length - 1 && styles.lineRowBorder,
                          { paddingLeft: 0 },
                        ]}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.lineDesc}>{item.description}</Text>
                          {item.type ? (
                            <Text style={styles.lineQty}>
                              {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                              {item.quantity && item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                            </Text>
                          ) : null}
                        </View>
                        {item.total_cost != null && item.total_cost > 0 && (
                          <Text style={styles.lineTotal}>{formatCad(item.total_cost)}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Milestones */}
                {activeQuote.milestones.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.sectionLabel}>Payment Milestones</Text>
                    <Text style={styles.sectionSub}>
                      Funds are released to the contractor only after you approve each completed milestone.
                    </Text>
                    {activeQuote.milestones.map((m, idx) => (
                      <View
                        key={m.id || idx}
                        style={[
                          styles.milestoneRow,
                          idx < activeQuote.milestones.length - 1 && styles.milestoneRowBorder,
                        ]}
                      >
                        <View
                          style={[
                            styles.milestoneNum,
                            {
                              borderColor: m.status === 'paid' ? '#34D399' : Colors.glass.border,
                              backgroundColor: m.status === 'paid' ? 'rgba(52,211,153,0.1)' : Colors.glass.surface,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.milestoneNumText,
                              { color: m.status === 'paid' ? '#34D399' : '#fff' },
                            ]}
                          >
                            {m.sort_order ?? idx + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.milestoneTitle}>{m.title}</Text>
                          {m.due_date ? (
                            <Text style={styles.milestonePct}>Due: {m.due_date}</Text>
                          ) : null}
                          {m.status === 'paid' && (
                            <Text style={styles.releasedBadge}>Released to contractor</Text>
                          )}
                        </View>
                        <Text style={styles.milestoneAmount}>{formatCad(m.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </GlassCard>
            )}

            {/* Trades on this project (names + status only — no per-trade amounts) */}
            {masterSlots.length > 0 && (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionLabel}>Your Trades</Text>
                <Text style={styles.sectionSub}>Each trade is paid from escrow only after you approve their completed work.</Text>
                {masterSlots.map((s) => {
                  const matchingQuote = quotes.find((q) => q.slot_id === s.id) ?? (quotes.length === 1 && !quotes[0].slot_id ? quotes[0] : null);
                  const joined = !!s.assigned_company_id && ['filled', 'scheduled'].includes(s.status ?? '');
                  const hasQuote = !!matchingQuote;
                  return (
                    <View key={s.id} style={styles.quoteOption}>
                      <View style={styles.quoteOptionLeft}>
                        <View style={[styles.quoteStatusDot, joined ? styles.quoteStatusDotPaid : styles.quoteStatusDotPending]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quoteCompany}>{formatTradeLabel(s.trade_type) ?? 'Trade'}</Text>
                          <Text style={styles.quoteStatusText}>
                            {hasQuote
                              ? `${s.company_name ?? matchingQuote?.company_name ?? 'Contractor'} · Quote: ${formatCad(matchingQuote.total_amount)}`
                              : joined
                              ? (s.company_name ?? 'Contractor joined')
                              : 'Finding a contractor…'}
                          </Text>
                        </View>
                      </View>
                      {joined ? <Ionicons name="checkmark-circle" size={17} color="#34D399" /> : null}
                    </View>
                  );
                })}
              </GlassCard>
            )}

            {/* How Escrow Works */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>How Escrow Works</Text>
              {[
                { icon: 'lock-closed-outline', text: 'You pay to WalkerAI upfront — held securely in Stripe Escrow, not released yet.' },
                { icon: 'hammer-outline', text: 'When a trade finishes their work or milestone, you review their photos and approve. Only then are funds released.' },
                { icon: 'shield-checkmark-outline', text: "You're always in control. No trade gets paid without your approval." },
              ].map((item, i) => (
                <View key={i} style={[styles.escrowRow, i < 2 && { marginBottom: 14 }]}>
                  <View style={styles.escrowIconWrap}>
                    <Ionicons name={item.icon} size={18} color="#FF6B00" />
                  </View>
                  <Text style={styles.escrowText}>{item.text}</Text>
                </View>
              ))}
            </GlassCard>

            {/* Monthly Financing & Equity Checker */}
            <GlassCard style={styles.card}>
              <View style={styles.financingHeader}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <Ionicons name="calculator" size={20} color="#60A5FA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.financingTitle}>Monthly Financing Available</Text>
                  <Text style={styles.financingSubTitle}>Check your renovation equity & loan eligibility</Text>
                </View>
              </View>
              <Text style={styles.financingBody}>
                Fund your renovation with flexible monthly payments. Calculate your instant home equity approval in seconds with no upfront impact.
              </Text>
              <TouchableOpacity
                style={styles.financingBtn}
                onPress={handleOpenFinancing}
                activeOpacity={0.82}
              >
                <Ionicons name="open-outline" size={16} color="#60A5FA" />
                <Text style={styles.financingBtnText}>Check Equity & Apply with Aristo</Text>
              </TouchableOpacity>
            </GlassCard>

            {/* Quote Pay CTA */}
            {canPayQuote && (
              <TouchableOpacity
                style={styles.payCta}
                onPress={() => handlePayQuote(pendingQuote.id, pendingQuote.total_amount)}
                activeOpacity={0.85}
                disabled={paying}
              >
                <Ionicons name="card-outline" size={20} color="#000" />
                <Text style={styles.payCtaText}>
                  {paying ? 'Processing…' : `Fund Quote ${formatCad(pendingQuote.total_amount)} (Stripe Escrow)`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Pay CTA */}
            {canPayMaster && (
              <TouchableOpacity style={styles.payCta} onPress={() => handlePayMaster(masterTotal)} activeOpacity={0.85} disabled={paying}>
                <Ionicons name="card-outline" size={20} color="#000" />
                <Text style={styles.payCtaText}>
                  {paying ? 'Processing…' : `Pay ${formatCad(masterTotal)} to WalkerAI`}
                </Text>
              </TouchableOpacity>
            )}

            {isFunded && (
              <View style={styles.paidBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                <Text style={styles.paidBannerText}>
                  {project?.status === 'active' ? 'Payment received — project is active' : 'Payment received — held in escrow'}
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </GradientBackground>
    );
}


const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { marginTop: 8, paddingHorizontal: Spacing.lg, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 48 },
  card: { marginBottom: Spacing.sm },

  // Price card
  priceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  priceLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  priceSubLabel: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  priceRange: { fontSize: 30, fontWeight: '800', color: '#FF6B00', letterSpacing: -0.5, marginBottom: 10 },
  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 13, color: '#34D399', fontWeight: '600' },
  pendingText: { fontSize: 13, color: Colors.text.tertiary, fontStyle: 'italic' },
  quoteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    marginTop: 8,
  },
  quoteOptionSelected: {
    borderColor: 'rgba(255,107,0,0.55)',
    backgroundColor: 'rgba(255,107,0,0.08)',
  },
  quoteOptionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  quoteOptionRight: { alignItems: 'flex-end', gap: 4 },
  quoteStatusDot: { width: 9, height: 9, borderRadius: 5 },
  quoteStatusDotPaid: { backgroundColor: '#34D399' },
  quoteStatusDotPending: { backgroundColor: '#FF6B00' },
  quoteCompany: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 2 },
  quoteStatusText: { fontSize: 12, color: Colors.text.tertiary },
  quoteOptionAmount: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  pendingQuoteNote: { fontSize: 12, color: Colors.text.tertiary, marginTop: 10, textAlign: 'center' },

  // Milestones
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionSub: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 14, lineHeight: 16 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  milestoneRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  milestoneNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  milestoneNumText: { fontSize: 12, fontWeight: '700' },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: Colors.text.primary, marginBottom: 2 },
  milestonePct: { fontSize: 12, color: Colors.text.tertiary },
  milestoneAmount: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  milestoneAmountDim: { fontSize: 16, fontWeight: '600', color: Colors.text.tertiary },
  releasedBadge: { fontSize: 11, color: '#34D399', fontWeight: '600', marginTop: 2 },
  tradeModelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  tradeModelText: { fontSize: 12, color: Colors.text.tertiary, flex: 1, lineHeight: 17 },
  pendingNote: { fontSize: 12, color: Colors.text.tertiary, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },

  // Scope
  scopeRow: { paddingVertical: 11, gap: 8 },
  phasePill: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,107,0,0.12)',
    borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)',
  },
  phaseText: { fontSize: 11, fontWeight: '700', color: '#FF6B00', textTransform: 'capitalize' },
  scopeDesc: { fontSize: 14, color: Colors.text.secondary, lineHeight: 20 },

  // Escrow
  escrowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  escrowIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,107,0,0.08)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  escrowText: { flex: 1, fontSize: 13, color: Colors.text.secondary, lineHeight: 19 },

  // Pay CTA
  payCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FF6B00', borderRadius: Radius.card, paddingVertical: 16,
    marginTop: 4, marginBottom: Spacing.sm,
  },
  payCtaText: { fontSize: 16, fontWeight: '700', color: '#000' },

  paidBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
    borderRadius: Radius.card, paddingVertical: 14, marginTop: 4,
  },
  paidBannerText: { fontSize: 14, fontWeight: '600', color: '#34D399' },

  // Line items
  lineSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  lineSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineSectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  lineCount: {
    backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  lineCountText: { fontSize: 11, fontWeight: '700', color: '#60A5FA' },
  otherLineCount: { backgroundColor: 'rgba(245,158,11,0.15)' },
  otherLineCountText: { color: '#F59E0B' },
  lineSectionRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineSectionTotal: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  lineDivider: { height: 1, backgroundColor: Colors.glass.border, marginVertical: 2 },
  lineRow: { paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingLeft: 24 },
  lineRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  lineDesc: { fontSize: 13, color: Colors.text.secondary, flex: 1, lineHeight: 18 },
  lineRight: { alignItems: 'flex-end', marginLeft: 12 },
  lineQty: { fontSize: 11, color: Colors.text.tertiary },
  lineTotal: { fontSize: 13, fontWeight: '600', color: Colors.text.primary },

  // Financing Card
  financingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  financingTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  financingSubTitle: { fontSize: 12, color: Colors.text.secondary, marginTop: 2 },
  financingBody: { fontSize: 13, color: Colors.text.secondary, lineHeight: 19, marginBottom: 14 },
  financingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderRadius: Radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  financingBtnText: { fontSize: 14, fontWeight: '700', color: '#60A5FA' },
});
