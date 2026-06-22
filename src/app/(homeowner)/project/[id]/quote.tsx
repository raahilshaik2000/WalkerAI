import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { GlassCard, GradientBackground } from '@/components/ui';

interface ProjectData {
  ai_cost_min: number;
  ai_cost_max: number;
  status: string;
  room_type: string | null;
  ai_analysis: any;
  payment_model: 'legacy' | 'master' | null;
  payment_status: 'unpaid' | 'funded' | 'refunded' | null;
  master_total_cents: number | null;
}

interface MasterSlot {
  id: string;
  trade_type: string | null;
  status: string | null;
  assigned_company_id: string | null;
  company_name: string | null;
}

interface Milestone {
  title: string;
  amount: number;
  sort_order: number;
  status: string;
}

interface LineItem {
  id: string;
  type: 'labour' | 'material' | 'other';
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  sort_order: number | null;
}

interface Quote {
  id: string;
  slot_id: string | null;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  stripe_payment_intent_id: string | null;
  milestones: Milestone[];
  company_name: string | null;
  trade_label: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
  project_slots?: { trade_type: string | null } | Array<{ trade_type: string | null }> | null;
}

function formatCad(cents: number) {
  return formatCadCents(cents);
}

const MILESTONE_COLORS = ['#FF6B00', '#60A5FA', '#34D399'];

function normalizeQuote(row: any): Quote {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const slot = Array.isArray(row.project_slots) ? row.project_slots[0] : row.project_slots;
  const tradeType = slot?.trade_type ?? null;
  return {
    ...row,
    slot_id: row.slot_id ?? null,
    company_name: company?.name ?? null,
    trade_label: formatTradeLabel(tradeType),
  };
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message)
    || /schema cache/i.test(message);
}

function isMissingQuoteSlotSelectError(error: { message?: string } | null | undefined) {
  if (!error?.message) return false;
  return /column .*slot_id.* does not exist/i.test(error.message)
    || /project_slots|relationship/i.test(error.message);
}

function isMissingLineItemsError(error: { message?: string } | null | undefined) {
  if (!error?.message) return false;
  return /relation .*quote_line_items.* does not exist/i.test(error.message)
    || /quote_line_items/i.test(error.message)
    || /schema cache/i.test(error.message);
}

function quoteStatusLabel(quote: Pick<Quote, 'status' | 'stripe_payment_intent_id'>) {
  if (quote.status === 'approved') return 'Paid';
  if (quote.status === 'pending' && quote.stripe_payment_intent_id) return 'Payment started';
  if (quote.status === 'pending') return 'Ready to pay';
  if (quote.status === 'rejected') return 'Rejected';
  return quote.status.replace(/_/g, ' ');
}

function milestoneStatusLabel(status: string) {
  if (status === 'paid') return 'Paid';
  if (status === 'homeowner_approved') return 'Approved';
  if (status === 'completed') return 'Ready for approval';
  return null;
}

export default function CostBreakdownScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [labourExpanded, setLabourExpanded] = useState(false);
  const [materialsExpanded, setMaterialsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
    if (!projectId) {
      setProject(null);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
      setErrorMessage('Project is missing. Reopen the quote from the project page.');
      setLoading(false);
      return;
    }
    const projectPromise = supabase
      .from('projects')
      .select('ai_cost_min, ai_cost_max, status, room_type, ai_analysis, payment_model, payment_status, master_total_cents')
      .eq('id', projectId)
      .maybeSingle();
    const quotesPromise = supabase
      .from('quotes')
      .select('id, slot_id, total_amount, status, submitted_at, stripe_payment_intent_id, companies(name), project_slots(trade_type), milestones ( title, amount, sort_order, status )')
      .eq('project_id', projectId)
      .order('submitted_at', { ascending: false });

    let [projectResult, initialQuoteResult] = await Promise.all([
      projectPromise,
      quotesPromise,
    ]);
    // Pre-migration fallback: master columns may not exist yet — treat as legacy.
    if (isMissingColumnError(projectResult.error)) {
      projectResult = await supabase
        .from('projects')
        .select('ai_cost_min, ai_cost_max, status, room_type, ai_analysis')
        .eq('id', projectId)
        .maybeSingle();
    }
    const { data: proj, error: projectError } = projectResult;
    let quotes: any[] | null = initialQuoteResult.data as any[] | null;
    let quoteError = initialQuoteResult.error;

    if (isMissingQuoteSlotSelectError(quoteError)) {
      const legacyQuotes = await supabase
        .from('quotes')
        .select('id, total_amount, status, submitted_at, stripe_payment_intent_id, companies(name), milestones ( title, amount, sort_order, status )')
        .eq('project_id', projectId)
        .order('submitted_at', { ascending: false });
      quotes = legacyQuotes.data;
      quoteError = legacyQuotes.error;
    }
    if (projectError) {
      setErrorMessage(formatAppSafeErrorMessage(projectError, 'Could not load quote.'));
      setProject(null);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
      setLoading(false);
      return;
    }
    if (!proj) {
      setErrorMessage('Project not found.');
      setProject(null);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
      setLoading(false);
      return;
    }
    // ── Master-quote projects: single project price, no per-trade quotes ──
    if ((proj as any).payment_model === 'master') {
      const { data: slotRows, error: slotsError } = await supabase
        .from('project_slots')
        .select('id, trade_type, status, assigned_company_id, companies(name)')
        .eq('project_id', projectId)
        .order('work_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (slotsError) {
        setErrorMessage(formatAppSafeErrorMessage(slotsError, 'Could not load project trades.'));
        setProject(proj as any);
        setMasterSlots([]);
        setLoading(false);
        return;
      }
      const slots: MasterSlot[] = ((slotRows ?? []) as any[]).map((s) => {
        const company = Array.isArray(s.companies) ? s.companies[0] : s.companies;
        return {
          id: s.id,
          trade_type: s.trade_type ?? null,
          status: s.status ?? null,
          assigned_company_id: s.assigned_company_id ?? null,
          company_name: company?.name ?? null,
        };
      });
      setProject(proj as any);
      setMasterSlots(slots);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
      setLoading(false);
      return;
    }

    if (quoteError) {
      setErrorMessage(formatAppSafeErrorMessage(quoteError, 'Could not load quote.'));
      setProject(proj as any);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
      setLoading(false);
      return;
    }

    const quoteRows = ((quotes ?? []) as any[]).map(normalizeQuote);
    const quoteData = quoteRows.find((q) => q.id === selectedQuoteId)
      ?? quoteRows.find((q) => q.status === 'pending')
      ?? quoteRows.find((q) => q.status === 'approved')
      ?? quoteRows[0]
      ?? null;
    setProject(proj as any);
    setQuotes(quoteRows);
    setQuote(quoteData);
    setSelectedQuoteId(quoteData?.id ?? null);

    // Fetch line items if quote exists
    if (quoteData?.id) {
      const { data: items, error: itemsError } = await supabase
        .from('quote_line_items')
        .select('id, type, description, quantity, unit, unit_cost, total_cost, sort_order')
        .eq('quote_id', quoteData.id)
        .order('sort_order', { ascending: true });
      if (itemsError) {
        if (isMissingLineItemsError(itemsError)) {
          setLineItems([]);
          setLoading(false);
          return;
        }
        setErrorMessage(formatAppSafeErrorMessage(itemsError, 'Could not load quote details.'));
        setLineItems([]);
        setLoading(false);
        return;
      }
      setLineItems((items as LineItem[]) ?? []);
    } else {
      setLineItems([]);
    }

    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load quote.'));
      setProject(null);
      setQuotes([]);
      setQuote(null);
      setLineItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedQuoteId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchData();
    });

    return () => subscription.remove();
  }, [fetchData]);

  const handlePay = async () => {
    if (!quote) return;
    Alert.alert(
      'Confirm Payment',
      `Pay ${formatCad(quote.total_amount)} for ${quote.company_name ?? 'this contractor'}? Funds are held in escrow and released milestone by milestone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPaying(true);
            try {
              const { data, error } = await supabase.functions.invoke('create-payment-intent', {
                body: { quote_id: quote.id },
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
                if (payErr.code !== 'Canceled') throw new Error(payErr.message);
                return;
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              setTimeout(() => fetchData(), 1500);
              setTimeout(() => fetchData(), 4000);
              Alert.alert(
                'Payment received!',
                'This contractor quote is now funded. Funds are held in escrow and released as milestones are completed.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Payment failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

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
                if (payErr.code !== 'Canceled') throw new Error(payErr.message);
                return;
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              setTimeout(() => fetchData(), 1500);
              setTimeout(() => fetchData(), 4000);
              Alert.alert(
                'Payment received!',
                'Your project is funded. Each trade is paid from escrow only after you approve their completed work.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Payment failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.bodySecondary}>Loading…</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (errorMessage) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={42} color={Colors.text.tertiary} />
            <Text style={Typography.h3}>Could not load quote</Text>
            <Text style={[Typography.bodySecondary, styles.errorText]}>{errorMessage}</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  // ── Master-quote project view: one price, pay WalkerAI, no commission/% ──
  if (project?.payment_model === 'master') {
    const masterTotal = project.master_total_cents && project.master_total_cents > 0
      ? project.master_total_cents
      : (project.ai_cost_min != null && project.ai_cost_max != null
        ? averageCostCents(project.ai_cost_min, project.ai_cost_max)
        : 0);
    const allTradesJoined = masterSlots.length > 0
      && masterSlots.every((s) => !!s.assigned_company_id && ['filled', 'scheduled'].includes(s.status ?? ''));
    const isFunded = project.payment_status === 'funded';
    const canPayMaster = !isFunded && allTradesJoined && masterTotal > 0;
    const pendingTrades = masterSlots.filter((s) => !s.assigned_company_id || !['filled', 'scheduled'].includes(s.status ?? '')).length;

    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Project Quote</Text>
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
                  <Text style={styles.priceLabel}>Project Total</Text>
                  <Text style={styles.priceSubLabel}>One price for your whole renovation</Text>
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

            {/* Trades on this project (names + status only — no per-trade amounts) */}
            {masterSlots.length > 0 && (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionLabel}>Your Trades</Text>
                <Text style={styles.sectionSub}>Each trade is paid from escrow only after you approve their completed work.</Text>
                {masterSlots.map((s) => {
                  const joined = !!s.assigned_company_id && ['filled', 'scheduled'].includes(s.status ?? '');
                  return (
                    <View key={s.id} style={styles.quoteOption}>
                      <View style={styles.quoteOptionLeft}>
                        <View style={[styles.quoteStatusDot, joined ? styles.quoteStatusDotPaid : styles.quoteStatusDotPending]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quoteCompany}>{formatTradeLabel(s.trade_type) ?? 'Trade'}</Text>
                          <Text style={styles.quoteStatusText}>
                            {joined ? (s.company_name ?? 'Contractor joined') : 'Finding a contractor…'}
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
                { icon: 'lock-closed-outline', text: 'You pay one project total to WalkerAI upfront — held securely, not released yet.' },
                { icon: 'hammer-outline', text: 'When a trade finishes their work, you review their photos and approve. Only then is that trade paid.' },
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
                  {project.status === 'active' ? 'Payment received — project is active' : 'Payment received — held in escrow'}
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const milestones = [...(quote?.milestones ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const totalAmount = quote?.total_amount ?? project?.ai_cost_min ?? 0;
  const projectEstimate = project?.ai_cost_min && project?.ai_cost_max
    ? `${formatCad(project.ai_cost_min)} - ${formatCad(project.ai_cost_max)}`
    : null;
  const headlinePrice = quote?.total_amount
    ? formatCad(quote.total_amount)
    : projectEstimate ?? (totalAmount > 0 ? formatCad(totalAmount) : '-');
  const payableProjectStatuses = ['dispatching', 'accepted', 'quoting', 'scheduling', 'active'];
  const canPay = !!quote && quote.status === 'pending' && payableProjectStatuses.includes(project?.status ?? '');
  const isPaid = quote?.status === 'approved';
  const paymentStarted = quote?.status === 'pending' && !!quote.stripe_payment_intent_id;
  const pendingQuoteCount = quotes.filter((q) => q.status === 'pending').length;
  const paidBannerText = project?.status === 'active'
    ? 'Payment received — project is active'
    : pendingQuoteCount > 0
    ? 'Payment received — fund remaining contractor quotes to start'
    : 'Payment received — project activation is processing';
  const scopeItems: Array<{ phase: string; description: string }> = project?.ai_analysis?.scope_of_work ?? [];

  const labourItems = lineItems.filter((li) => li.type === 'labour');
  const materialItems = lineItems.filter((li) => li.type === 'material');
  const otherItems = lineItems.filter((li) => li.type === 'other');

  function toggleLabour() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLabourExpanded((v) => !v);
  }

  function toggleMaterials() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMaterialsExpanded((v) => !v);
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cost Breakdown</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Quote summary */}
          <GlassCard style={styles.card}>
            <View style={styles.priceHeader}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,107,0,0.12)' }]}>
                <Ionicons name="sparkles" size={20} color="#FF6B00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceLabel}>{quote ? 'Selected Contractor Quote' : 'WalkerAI Estimate'}</Text>
                <Text style={styles.priceSubLabel}>
                  {quote
                    ? projectEstimate
                      ? `Project estimate: ${projectEstimate}`
                      : 'Final pricing from the selected contractor quote'
                    : 'AI-generated budget range before contractor quote'}
                </Text>
              </View>
            </View>
            <Text style={styles.priceRange}>{headlinePrice}</Text>
            {quote?.total_amount ? (
              <View style={styles.confirmedRow}>
                <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                <Text style={styles.confirmedText}>
                  {quote.company_name ?? 'Contractor'} quote{quote.trade_label ? ` · ${quote.trade_label}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={styles.pendingText}>Waiting for a contractor to accept this project</Text>
            )}
          </GlassCard>

          {quotes.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Contractor Quotes</Text>
              <Text style={styles.sectionSub}>
                Review and fund each contractor quote separately. Every trade keeps its own escrow and milestones.
              </Text>
              {quotes.map((q) => {
                const selected = q.id === quote?.id;
                const paid = q.status === 'approved';
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={[styles.quoteOption, selected && styles.quoteOptionSelected]}
                    onPress={() => setSelectedQuoteId(q.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.quoteOptionLeft}>
                      <View style={[styles.quoteStatusDot, paid ? styles.quoteStatusDotPaid : styles.quoteStatusDotPending]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.quoteCompany}>{q.company_name ?? 'Contractor quote'}</Text>
                        <Text style={styles.quoteStatusText}>
                          {q.trade_label ? `${q.trade_label} · ${quoteStatusLabel(q)}` : quoteStatusLabel(q)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.quoteOptionRight}>
                      <Text style={styles.quoteOptionAmount}>{formatCad(q.total_amount)}</Text>
                      {selected ? <Ionicons name="checkmark-circle" size={17} color="#FF6B00" /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {pendingQuoteCount > 0 ? (
                <Text style={styles.pendingQuoteNote}>
                  {pendingQuoteCount} quote{pendingQuoteCount === 1 ? '' : 's'} still need escrow funding.
                </Text>
              ) : null}
            </GlassCard>
          )}

          {/* Line Items — Labour & Materials */}
          {lineItems.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Cost Breakdown</Text>

              {/* Labour */}
              {labourItems.length > 0 && (
                <>
                  <TouchableOpacity style={styles.lineSection} onPress={toggleLabour} activeOpacity={0.7}>
                    <View style={styles.lineSectionLeft}>
                      <Ionicons name="hammer-outline" size={16} color="#60A5FA" />
                      <Text style={styles.lineSectionTitle}>Labour</Text>
                      <View style={styles.lineCount}>
                        <Text style={styles.lineCountText}>{labourItems.length}</Text>
                      </View>
                    </View>
                    <View style={styles.lineSectionRight}>
                      {labourItems.some((li) => li.total_cost) && (
                        <Text style={styles.lineSectionTotal}>
                          {formatCad(labourItems.reduce((s, li) => s + (li.total_cost ?? 0), 0))}
                        </Text>
                      )}
                      <Ionicons name={labourExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.tertiary} />
                    </View>
                  </TouchableOpacity>

                  {labourExpanded && labourItems.map((li, i) => (
                    <View key={li.id} style={[styles.lineRow, i < labourItems.length - 1 && styles.lineRowBorder]}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      <View style={styles.lineRight}>
                        {li.quantity !== 1 || li.unit ? (
                          <Text style={styles.lineQty}>{li.quantity}{li.unit ? ` ${li.unit}` : ''}</Text>
                        ) : null}
                        {li.total_cost ? (
                          <Text style={styles.lineTotal}>{formatCad(li.total_cost)}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Materials */}
              {materialItems.length > 0 && (
                <>
                  <View style={[styles.lineDivider, labourItems.length > 0 && { marginTop: 2 }]} />
                  <TouchableOpacity style={styles.lineSection} onPress={toggleMaterials} activeOpacity={0.7}>
                    <View style={styles.lineSectionLeft}>
                      <Ionicons name="cube-outline" size={16} color="#A78BFA" />
                      <Text style={styles.lineSectionTitle}>Materials</Text>
                      <View style={[styles.lineCount, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                        <Text style={[styles.lineCountText, { color: '#A78BFA' }]}>{materialItems.length}</Text>
                      </View>
                    </View>
                    <View style={styles.lineSectionRight}>
                      {materialItems.some((li) => li.total_cost) && (
                        <Text style={styles.lineSectionTotal}>
                          {formatCad(materialItems.reduce((s, li) => s + (li.total_cost ?? 0), 0))}
                        </Text>
                      )}
                      <Ionicons name={materialsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.tertiary} />
                    </View>
                  </TouchableOpacity>

                  {materialsExpanded && materialItems.map((li, i) => (
                    <View key={li.id} style={[styles.lineRow, i < materialItems.length - 1 && styles.lineRowBorder]}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      <View style={styles.lineRight}>
                        {li.quantity !== 1 || li.unit ? (
                          <Text style={styles.lineQty}>{li.quantity}{li.unit ? ` ${li.unit}` : ''}</Text>
                        ) : null}
                        {li.total_cost ? (
                          <Text style={styles.lineTotal}>{formatCad(li.total_cost)}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {otherItems.length > 0 && (
                <>
                  <View style={styles.lineDivider} />
                  <View style={styles.lineSection}>
                    <View style={styles.lineSectionLeft}>
                      <Ionicons name="receipt-outline" size={16} color="#F59E0B" />
                      <Text style={styles.lineSectionTitle}>Other</Text>
                      <View style={[styles.lineCount, styles.otherLineCount]}>
                        <Text style={[styles.lineCountText, styles.otherLineCountText]}>{otherItems.length}</Text>
                      </View>
                    </View>
                    {otherItems.some((li) => li.total_cost) && (
                      <Text style={styles.lineSectionTotal}>
                        {formatCad(otherItems.reduce((s, li) => s + (li.total_cost ?? 0), 0))}
                      </Text>
                    )}
                  </View>

                  {otherItems.map((li, i) => (
                    <View key={li.id} style={[styles.lineRow, i < otherItems.length - 1 && styles.lineRowBorder]}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      {li.total_cost ? (
                        <Text style={styles.lineTotal}>{formatCad(li.total_cost)}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </GlassCard>
          )}

          {/* Milestone Payment Schedule */}
          {milestones.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Payment Schedule</Text>
              <Text style={styles.sectionSub}>Funds held in escrow — released after each milestone is approved</Text>
              {milestones.map((m, i) => (
                <View key={i} style={[styles.milestoneRow, i < milestones.length - 1 && styles.milestoneRowBorder]}>
                  <View style={[styles.milestoneNum, { backgroundColor: MILESTONE_COLORS[i % 3] + '18', borderColor: MILESTONE_COLORS[i % 3] + '60' }]}>
                    <Text style={[styles.milestoneNumText, { color: MILESTONE_COLORS[i % 3] }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneTitle}>{m.title}</Text>
                    <Text style={styles.milestonePct}>
                      {quote?.total_amount ? `${Math.round((m.amount / quote.total_amount) * 100)}% of total` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.milestoneAmount}>{formatCad(m.amount)}</Text>
                    {milestoneStatusLabel(m.status) ? (
                      <Text style={styles.releasedBadge}>{milestoneStatusLabel(m.status)}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* No milestone yet placeholder */}
          {milestones.length === 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Payment Schedule</Text>
              <Text style={styles.sectionSub}>
                Milestones are assigned per trade — payment is released from escrow only when each trade completes their work and you approve it.
              </Text>
              <View style={styles.tradeModelRow}>
                <Ionicons name="construct-outline" size={15} color={Colors.text.tertiary} />
                <Text style={styles.tradeModelText}>e.g. Plumber → Electrician → Tiler → Carpenter — each paid separately</Text>
              </View>
              <Text style={styles.pendingNote}>Exact milestones and amounts are set once a contractor accepts</Text>
            </GlassCard>
          )}

          {/* What's Included */}
          {scopeItems.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>What's Included</Text>
              {scopeItems.map((s: any, i: number) => (
                <View key={i} style={[styles.scopeRow, i < scopeItems.length - 1 && styles.milestoneRowBorder]}>
                  <View style={styles.phasePill}>
                    <Text style={styles.phaseText}>{s.phase}</Text>
                  </View>
                  <Text style={styles.scopeDesc}>{s.description}</Text>
                </View>
              ))}
            </GlassCard>
          )}

          {/* How Escrow Works */}
          <GlassCard style={styles.card}>
            <Text style={styles.sectionLabel}>How Escrow Works</Text>
            {[
              { icon: 'lock-closed-outline', text: "You pay the full amount upfront — it's held securely, not released to the contractor yet." },
              { icon: 'hammer-outline', text: 'Each trade gets their own milestone. When a trade finishes their work, you review and approve releasing only their payment — not the full amount.' },
              { icon: 'shield-checkmark-outline', text: 'You\'re always in control. No milestone gets paid without your approval.' },
            ].map((item, i) => (
              <View key={i} style={[styles.escrowRow, i < 2 && { marginBottom: 14 }]}>
                <View style={styles.escrowIconWrap}>
                  <Ionicons name={item.icon} size={18} color="#FF6B00" />
                </View>
                <Text style={styles.escrowText}>{item.text}</Text>
              </View>
            ))}
          </GlassCard>

          {/* Pay CTA */}
          {canPay && !isPaid && (
            <TouchableOpacity style={styles.payCta} onPress={handlePay} activeOpacity={0.85} disabled={paying}>
              <Ionicons name="card-outline" size={20} color="#000" />
              <Text style={styles.payCtaText}>
                {paying ? 'Processing…' : paymentStarted ? `Continue Payment — ${formatCad(quote.total_amount)}` : `Pay ${formatCad(quote.total_amount)} to Start`}
              </Text>
            </TouchableOpacity>
          )}

          {isPaid && (
            <View style={styles.paidBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.paidBannerText}>{paidBannerText}</Text>
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
});
