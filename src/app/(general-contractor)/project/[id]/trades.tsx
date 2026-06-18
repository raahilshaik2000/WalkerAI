import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents, parseNonNegativeCadToCents, parseSignedCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { GENERAL_CONTRACTOR_READINESS_SELECT, isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { formatTradeLabel } from '@/lib/trade-labels';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';
import type { GcTradeQuoteNegotiation } from '@/types/database.types';

interface Slot {
  id: string;
  trade_type: string;
  description: string | null;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  status: string;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  external_trade_verification_status?: string | null;
  assigned_company?: { id: string; name: string | null; verified: boolean | null } | Array<{ id: string; name: string | null; verified: boolean | null }> | null;
}

interface Quote {
  id: string;
  slot_id: string | null;
  company_id: string | null;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  stripe_payment_intent_id: string | null;
  company?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

interface ProjectBudget {
  ai_cost_min: number | null;
  ai_cost_max: number | null;
}

interface DispatchResult {
  success?: boolean;
  dispatched?: number;
  message?: string;
}

function formatTrade(tradeType: string) {
  return formatTradeLabel(tradeType) ?? 'Trade';
}

function getCompany(slot: Slot) {
  return Array.isArray(slot.assigned_company) ? slot.assigned_company[0] ?? null : slot.assigned_company ?? null;
}

function getQuoteCompany(quote: Quote) {
  return Array.isArray(quote.company) ? quote.company[0]?.name ?? null : quote.company?.name ?? null;
}

function canNegotiateQuote(quote: Quote) {
  return quote.status === 'pending' && !quote.stripe_payment_intent_id;
}

function estimateLabel(slot: Slot) {
  if ((slot.estimated_cost_min ?? 0) <= 0 && (slot.estimated_cost_max ?? 0) <= 0) {
    return 'Estimate pending';
  }
  if (slot.estimated_cost_min != null && slot.estimated_cost_max != null) {
    return `${formatCadCents(slot.estimated_cost_min)} - ${formatCadCents(slot.estimated_cost_max)}`;
  }
  if (slot.estimated_cost_min != null || slot.estimated_cost_max != null) {
    return formatCadCents(slot.estimated_cost_min ?? slot.estimated_cost_max ?? 0);
  }
  return 'No estimate';
}

function formatDate(value: string | null) {
  if (!value) return 'Not submitted';
  return new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GeneralContractorTradesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [projectBudget, setProjectBudget] = useState<ProjectBudget | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [negotiations, setNegotiations] = useState<GcTradeQuoteNegotiation[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [recommendedTradeName, setRecommendedTradeName] = useState('');
  const [recommendedCompany, setRecommendedCompany] = useState('');
  const [recommendedContact, setRecommendedContact] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [recommendationNote, setRecommendationNote] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [dispatchingTrades, setDispatchingTrades] = useState(false);
  const [cancellingNegotiationId, setCancellingNegotiationId] = useState<string | null>(null);
  const [gcReady, setGcReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quotesBySlot = useMemo(() => {
    const grouped = new Map<string, Quote[]>();
    for (const quote of quotes) {
      const key = quote.slot_id ?? 'legacy';
      const existing = grouped.get(key) ?? [];
      existing.push(quote);
      grouped.set(key, existing);
    }
    return grouped;
  }, [quotes]);

  const negotiationsByQuote = useMemo(() => {
    const grouped = new Map<string, GcTradeQuoteNegotiation[]>();
    for (const negotiation of negotiations) {
      const existing = grouped.get(negotiation.quote_id) ?? [];
      existing.push(negotiation);
      grouped.set(negotiation.quote_id, existing);
    }
    return grouped;
  }, [negotiations]);

  const dispatchableSlotCount = useMemo(() => (
    slots.filter((slot) => (
      slot.fulfillment_type !== 'external'
      && !getCompany(slot)
      && ['open', 'dispatching'].includes(slot.status)
    )).length
  ), [slots]);
  const selectedSlot = useMemo(() => slots.find((slot) => slot.id === selectedSlotId) ?? null, [slots, selectedSlotId]);
  const selectedSlotAssignedCompany = selectedSlot ? getCompany(selectedSlot) : null;
  const selectedSlotHasAssignedCompany = !!selectedSlotAssignedCompany;
  const selectedSlotHasApprovedQuote = selectedSlot
    ? (quotesBySlot.get(selectedSlot.id) ?? []).some((quote) => quote.status === 'approved')
    : false;
  const projectBudgetReady = (projectBudget?.ai_cost_min ?? 0) > 0 && (projectBudget?.ai_cost_max ?? 0) > 0;
  const canManageTradeRequests = assignment?.status === 'active' && gcReady;

  const fetchData = useCallback(async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      setErrorMessage('You need to be signed in to manage trades.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select(GENERAL_CONTRACTOR_READINESS_SELECT)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      setGcReady(isGeneralContractorReadyForProjectControls(gc));

      const [assignmentResult, projectResult, slotResult, quoteResult, negotiationResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('id, status, homeowner_id, general_contractor_id')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .maybeSingle(),
        supabase
          .from('projects')
          .select('ai_cost_min, ai_cost_max')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select(`
            id, trade_type, description, estimated_cost_min, estimated_cost_max, status,
            fulfillment_type, external_trade_name, external_trade_company, external_trade_verification_status,
            assigned_company:companies!assigned_company_id(id, name, verified)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('quotes')
          .select('id, slot_id, company_id, total_amount, status, submitted_at, stripe_payment_intent_id, company:companies!company_id(name)')
          .eq('project_id', projectId)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('gc_trade_quote_negotiations')
          .select('id, project_id, slot_id, quote_id, general_contractor_id, company_id, homeowner_id, offer_amount_cents, scope_note, status, company_response_note, created_at, responded_at, cancelled_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (assignmentResult.error) throw assignmentResult.error;
      if (projectResult.error) throw projectResult.error;
      if (slotResult.error) throw slotResult.error;
      if (quoteResult.error) throw quoteResult.error;
      if (negotiationResult.error) throw negotiationResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setProjectBudget(projectResult.data as ProjectBudget | null);
      setSlots((slotResult.data ?? []) as Slot[]);
      setQuotes((quoteResult.data ?? []) as Quote[]);
      setNegotiations((negotiationResult.data ?? []) as GcTradeQuoteNegotiation[]);
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load trade management.'));
      setAssignment(null);
      setProjectBudget(null);
      setSlots([]);
      setQuotes([]);
      setNegotiations([]);
      setGcReady(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleGenerateSlots = async () => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen trade management from the project detail screen.');
      return;
    }
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before you can generate trade slots.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before you can generate trade slots.');
      return;
    }
    if (!projectBudgetReady) {
      Alert.alert('Budget required', 'Generate or approve the project budget before WalkerAI can create priced trade slots.');
      return;
    }

    setGeneratingSlots(true);
    try {
      const { error } = await supabase.functions.invoke('generate-trade-slots', {
        body: { project_id: projectId },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      Alert.alert('Trade plan generated', 'WalkerAI created trade slots for this project. Review them before recommending changes.');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not generate trades', await formatSupabaseFunctionError(err, 'Please confirm the project budget has been generated first.'));
    } finally {
      setGeneratingSlots(false);
    }
  };

  const handleDispatchTrades = async () => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen trade management from the project detail screen.');
      return;
    }
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before you can dispatch WalkerAI trades.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before you can dispatch WalkerAI trades.');
      return;
    }
    if (dispatchableSlotCount === 0) {
      Alert.alert('No open slots', 'Every WalkerAI trade slot is already assigned, externally managed, or scheduled.');
      return;
    }
    if (!projectBudgetReady) {
      Alert.alert('Budget required', 'Generate or approve the project budget before WalkerAI can dispatch open trade slots.');
      return;
    }

    setDispatchingTrades(true);
    try {
      const { data, error } = await supabase.functions.invoke<DispatchResult>('dispatch-slots', {
        body: { project_id: projectId, round: 1 },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      if (data?.success === false || !data?.dispatched) {
        Alert.alert('No trades dispatched', data?.message ?? 'No verified companies matched these open slots yet.');
      } else {
        Alert.alert('Trades notified', `${data.dispatched} trade invitation${data.dispatched === 1 ? '' : 's'} sent through WalkerAI.`);
      }
      await fetchData();
    } catch (err) {
      Alert.alert('Could not dispatch trades', await formatSupabaseFunctionError(err, 'Please confirm the project budget and coordinates are ready.'));
    } finally {
      setDispatchingTrades(false);
    }
  };

  const selectSlot = (slot: Slot) => {
    setSelectedSlotId(slot.id);
    setSelectedQuoteId(null);
    setRecommendedTradeName(slot.fulfillment_type === 'external' ? slot.external_trade_name ?? '' : '');
    setRecommendedCompany(slot.fulfillment_type === 'external' ? slot.external_trade_company ?? '' : '');
    setRecommendedContact('');
    setCostDelta('');
    setRecommendationNote('');
    setCounterAmount('');
    setCounterNote('');
  };

  const handleSubmit = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before trade recommendations can be sent.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before trade recommendations can be sent.');
      return;
    }
    const slot = slots.find((s) => s.id === selectedSlotId);
    if (!slot) {
      Alert.alert('Trade required', 'Choose the trade you want to recommend changing.');
      return;
    }
    const assignedCompany = getCompany(slot);
    const slotHasApprovedQuote = (quotesBySlot.get(slot.id) ?? []).some((quote) => quote.status === 'approved');
    if (assignedCompany?.id && slotHasApprovedQuote) {
      Alert.alert(
        'Funded quote locked',
        'This WalkerAI trade has a funded quote. Resolve escrow and milestones before recommending a replacement.',
      );
      return;
    }
    if (!recommendedTradeName.trim() && !recommendedCompany.trim()) {
      Alert.alert('Recommendation required', 'Enter the trade contact or company you recommend.');
      return;
    }
    const costDeltaCents = costDelta.trim() ? parseSignedCadToCents(costDelta) : null;
    if (costDelta.trim() && costDeltaCents == null) {
      Alert.alert('Invalid cost impact', 'Enter the cost impact as a signed CAD amount, like +500 or -250.');
      return;
    }

    const currentCompany = assignedCompany?.name;
    const title = `${formatTrade(slot.trade_type)} trade recommendation`;
    const details = [
      currentCompany ? `Current WalkerAI trade: ${currentCompany}` : null,
      slot.fulfillment_type === 'external' ? `Current external trade: ${slot.external_trade_name ?? 'External trade'}` : null,
      recommendedTradeName.trim() ? `Recommended trade: ${recommendedTradeName.trim()}` : null,
      recommendedCompany.trim() ? `Recommended company: ${recommendedCompany.trim()}` : null,
      recommendedContact.trim() ? `Contact: ${recommendedContact.trim()}` : null,
      recommendationNote.trim() || null,
    ].filter(Boolean).join('\n');

    setSubmitting(true);
    try {
      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: 'trade_substitution',
        title,
        description: details,
        cost_delta: costDeltaCents,
        metadata: {
          slot_id: slot.id,
          trade_type: slot.trade_type,
          current_company_name: currentCompany ?? null,
          current_fulfillment_type: slot.fulfillment_type ?? 'walker_ai',
          current_external_trade_name: slot.external_trade_name ?? null,
          recommended_trade_name: recommendedTradeName.trim() || null,
          recommended_company: recommendedCompany.trim() || null,
          recommended_contact: recommendedContact.trim() || null,
          recommendation_note: recommendationNote.trim() || null,
          external_management_requested: !assignedCompany && slot.fulfillment_type !== 'external',
          walker_ai_replacement_requested: !!assignedCompany,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', 'No trade assignment changes until the homeowner approves this recommendation.');
      setSelectedSlotId(null);
      setRecommendedTradeName('');
      setRecommendedCompany('');
      setRecommendedContact('');
      setCostDelta('');
      setRecommendationNote('');
    } catch (err) {
      Alert.alert('Could not send recommendation', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const selectQuoteForNegotiation = (quote: Quote) => {
    setSelectedQuoteId(quote.id);
    setCounterAmount((quote.total_amount / 100).toFixed(2));
    setCounterNote('');
  };

  const handleSendNegotiation = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before trade negotiation requests can be sent.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before trade negotiation requests can be sent.');
      return;
    }
    const quote = quotes.find((item) => item.id === selectedQuoteId);
    if (!quote) {
      Alert.alert('Quote required', 'Choose the trade quote you want to negotiate.');
      return;
    }
    if (!canNegotiateQuote(quote)) {
      Alert.alert('Quote negotiation locked', 'Only pending quotes without started payment can be negotiated. Use change orders after payment begins.');
      return;
    }
    if (!quote.company_id) {
      Alert.alert('Company missing', 'This quote is missing its trade company reference.');
      return;
    }
    const offerAmountCents = counterAmount.trim() ? parseNonNegativeCadToCents(counterAmount) : null;
    if (counterAmount.trim() && offerAmountCents == null) {
      Alert.alert('Invalid counter amount', 'Enter a positive CAD amount like 1250 or 1250.00.');
      return;
    }
    if (!offerAmountCents && !counterNote.trim()) {
      Alert.alert('Negotiation details required', 'Enter a counter amount, revision note, or both.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('gc_trade_quote_negotiations').insert({
        project_id: projectId,
        slot_id: quote.slot_id,
        quote_id: quote.id,
        general_contractor_id: assignment.general_contractor_id,
        company_id: quote.company_id,
        homeowner_id: assignment.homeowner_id,
        offer_amount_cents: offerAmountCents,
        scope_note: counterNote.trim() || 'Please review this counteroffer and respond in WalkerAI.',
      });
      if (error) throw error;
      Alert.alert('Sent to trade', 'The company can accept, reject, or request a quote revision. No homeowner-facing price changes are applied automatically.');
      setSelectedQuoteId(null);
      setCounterAmount('');
      setCounterNote('');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not send negotiation', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelNegotiation = async (negotiation: GcTradeQuoteNegotiation) => {
    if (negotiation.status !== 'pending') {
      Alert.alert('Negotiation already finalized', 'Only pending trade negotiation requests can be cancelled.');
      return;
    }
    if (!assignment?.general_contractor_id) {
      Alert.alert('Negotiation unavailable', 'Refresh trade management and try again.');
      return;
    }
    if (assignment.status !== 'active' || !gcReady) {
      Alert.alert('Active complete GC management required', 'Only an active verified GC with complete setup can cancel a pending trade negotiation request.');
      return;
    }

    Alert.alert(
      'Cancel trade negotiation?',
      'This removes the pending counteroffer or revision request. It does not change the homeowner-facing quote.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setCancellingNegotiationId(negotiation.id);
            const { error } = await supabase
              .from('gc_trade_quote_negotiations')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
              })
              .eq('id', negotiation.id)
              .eq('project_id', projectId)
              .eq('general_contractor_id', assignment.general_contractor_id)
              .eq('status', 'pending');

            if (error) {
              Alert.alert('Could not cancel negotiation', formatAppSafeErrorMessage(error, 'Please try again.'));
            } else {
              await fetchData();
            }
            setCancellingNegotiationId(null);
          },
        },
      ],
    );
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerBody}>
              <Text style={styles.title}>Trade Management</Text>
              <Text style={styles.subtitle}>Compare slots and quotes. Homeowners approve trade changes.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Homeowner approval required</Text>
            <Text style={styles.bodyText}>
              A GC can recommend trade replacements, external management, or pricing changes. No trade assignment, spending, escrow release, or scope change is applied here.
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading trade plan...</Text>
            </GlassCard>
          ) : slots.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Trade slots have not been generated yet.</Text>
              {assignment?.status === 'active' && gcReady && projectBudgetReady ? (
                <GlassButton
                  label="Generate Trade Plan"
                  onPress={handleGenerateSlots}
                  loading={generatingSlots}
                  disabled={generatingSlots}
                  fullWidth
                  size="sm"
                  style={styles.actionButton}
                />
              ) : (
                <Text style={styles.emptyHint}>
                  {assignment?.status === 'active' && gcReady && !projectBudgetReady
                    ? 'Generate or approve the project budget before WalkerAI can create priced trade slots.'
                    : assignment?.status === 'active'
                    ? 'Complete verified GC setup is required before a GC can generate the trade plan.'
                    : 'Homeowner confirmation is required before a GC can generate the trade plan.'}
                </Text>
              )}
            </GlassCard>
          ) : (
            <>
              {assignment?.status === 'active' && !gcReady ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.bodyText}>Complete verified GC setup is required before trade recommendations can be sent.</Text>
                </GlassCard>
              ) : assignment?.status !== 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.bodyText}>Homeowner confirmation is required before trade recommendations can be sent.</Text>
                </GlassCard>
              ) : null}

              {assignment?.status === 'active' && gcReady && dispatchableSlotCount > 0 ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>WalkerAI trade marketplace</Text>
                  <Text style={styles.bodyText}>
                    Dispatch open WalkerAI slots to matching verified companies. Homeowner approval is still required for scope, payment, and later substitutions.
                  </Text>
                  {projectBudgetReady ? (
                    <GlassButton
                      label={`Dispatch ${dispatchableSlotCount} Open Slot${dispatchableSlotCount === 1 ? '' : 's'}`}
                      onPress={handleDispatchTrades}
                      loading={dispatchingTrades}
                      disabled={dispatchingTrades}
                      fullWidth
                      size="sm"
                      style={styles.actionButton}
                    />
                  ) : (
                    <Text style={styles.emptyHint}>
                      Generate or approve the project budget before WalkerAI can dispatch open trade slots.
                    </Text>
                  )}
                </GlassCard>
              ) : null}

              {slots.map((slot) => {
                const selected = selectedSlotId === slot.id;
                const company = getCompany(slot);
                const slotQuotes = quotesBySlot.get(slot.id) ?? [];
                const participant = slot.fulfillment_type === 'external'
                  ? slot.external_trade_name ?? 'External trade'
                  : company?.name ?? 'Unassigned';

                return (
                  <TouchableOpacity key={slot.id} onPress={() => selectSlot(slot)} activeOpacity={0.85}>
                    <GlassCard style={[styles.card, selected && styles.cardSelected]}>
                      <View style={styles.slotHeader}>
                        <View style={styles.slotIcon}>
                          <Icon
                            name={slot.fulfillment_type === 'external' ? 'account-hard-hat' : company ? 'account-check-outline' : 'account-search-outline'}
                            size={20}
                            color={selected ? Colors.accent : Colors.text.secondary}
                          />
                        </View>
                        <View style={styles.slotBody}>
                          <Text style={styles.slotTitle}>{formatTrade(slot.trade_type)}</Text>
                          <Text style={styles.slotMeta}>{participant}</Text>
                        </View>
                        <StatusBadge
                          label={slot.fulfillment_type === 'external' ? 'External' : formatStatusLabel(slot.status)}
                          variant={slot.fulfillment_type === 'external' ? 'pending' : slot.status === 'filled' || slot.status === 'scheduled' ? 'active' : 'neutral'}
                          dot
                        />
                      </View>
                      {slot.description ? <Text style={styles.description}>{slot.description}</Text> : null}
                      <View style={styles.metricRow}>
                        <View style={styles.metric}>
                          <Text style={styles.metricLabel}>Estimate</Text>
                          <Text style={styles.metricValue}>{estimateLabel(slot)}</Text>
                        </View>
                        <View style={styles.metric}>
                          <Text style={styles.metricLabel}>Quotes</Text>
                          <Text style={styles.metricValue}>{slotQuotes.length}</Text>
                        </View>
                        <View style={styles.metric}>
                          <Text style={styles.metricLabel}>Credentials</Text>
                          <Text style={styles.metricValue}>
                            {slot.fulfillment_type === 'external'
                              ? formatStatusLabel(slot.external_trade_verification_status ?? 'unverified')
                              : company?.verified ? 'Verified' : company ? 'Company profile' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                      {slot.fulfillment_type === 'external' ? (
                        <Text style={styles.warning}>External scope is not verified by WalkerAI and has no platform escrow protection.</Text>
                      ) : null}
                      {slotQuotes.length > 0 ? (
                        <View style={styles.quoteList}>
                          {slotQuotes.map((quote) => {
                            const quoteNegotiations = negotiationsByQuote.get(quote.id) ?? [];
                            return (
                              <View key={quote.id}>
                                <View style={[styles.quoteRow, selectedQuoteId === quote.id && styles.quoteRowSelected]}>
                                  <View style={styles.quoteDot} />
                                  <View style={styles.quoteBody}>
                                    <Text style={styles.quoteTitle}>{getQuoteCompany(quote) ?? 'Contractor quote'}</Text>
                                    <Text style={styles.quoteMeta}>{formatStatusLabel(quote.status)} · {formatDate(quote.submitted_at)}</Text>
                                  </View>
                                  <View style={styles.quoteActions}>
                                    <Text style={styles.quoteAmount}>{formatCadCents(quote.total_amount)}</Text>
                                    <TouchableOpacity
                                      style={styles.negotiateButton}
                                      onPress={() => selectQuoteForNegotiation(quote)}
                                      disabled={!canNegotiateQuote(quote) || !canManageTradeRequests}
                                    >
                                      <Text style={styles.negotiateText}>Negotiate</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                {quote.status === 'pending' && quote.stripe_payment_intent_id ? (
                                  <Text style={styles.warning}>
                                    Payment has started for this quote. Pricing changes must use change orders.
                                  </Text>
                                ) : null}
                                {quoteNegotiations.map((negotiation) => (
                                  <View key={negotiation.id} style={styles.negotiationRow}>
                                    <Text style={styles.negotiationMeta}>
                                      {formatStatusLabel(negotiation.status)}
                                      {negotiation.offer_amount_cents ? ` · ${formatCadCents(negotiation.offer_amount_cents)}` : ''}
                                    </Text>
                                    <Text style={styles.negotiationNote} numberOfLines={2}>{negotiation.scope_note}</Text>
                                    {negotiation.company_response_note ? (
                                      <Text style={styles.negotiationResponse} numberOfLines={2}>Trade: {negotiation.company_response_note}</Text>
                                    ) : null}
                                    {negotiation.status === 'pending' && canManageTradeRequests ? (
                                      <GlassButton
                                        label="Cancel Request"
                                        onPress={() => handleCancelNegotiation(negotiation)}
                                        loading={cancellingNegotiationId === negotiation.id}
                                        disabled={!canManageTradeRequests || !!cancellingNegotiationId}
                                        variant="secondary"
                                        size="sm"
                                        style={styles.cancelNegotiationButton}
                                      />
                                    ) : null}
                                  </View>
                                ))}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}

              {quotesBySlot.get('legacy')?.length ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Project-level quotes</Text>
                  {(quotesBySlot.get('legacy') ?? []).map((quote) => {
                    const quoteNegotiations = negotiationsByQuote.get(quote.id) ?? [];
                    return (
                      <View key={quote.id}>
                        <View style={[styles.quoteRow, selectedQuoteId === quote.id && styles.quoteRowSelected]}>
                          <View style={styles.quoteDot} />
                          <View style={styles.quoteBody}>
                            <Text style={styles.quoteTitle}>{getQuoteCompany(quote) ?? 'Contractor quote'}</Text>
                            <Text style={styles.quoteMeta}>{formatStatusLabel(quote.status)} · {formatDate(quote.submitted_at)}</Text>
                          </View>
                          <View style={styles.quoteActions}>
                            <Text style={styles.quoteAmount}>{formatCadCents(quote.total_amount)}</Text>
                            <TouchableOpacity
                              style={styles.negotiateButton}
                              onPress={() => selectQuoteForNegotiation(quote)}
                              disabled={!canNegotiateQuote(quote) || !canManageTradeRequests}
                            >
                              <Text style={styles.negotiateText}>Negotiate</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {quote.status === 'pending' && quote.stripe_payment_intent_id ? (
                          <Text style={styles.warning}>
                            Payment has started for this quote. Pricing changes must use change orders.
                          </Text>
                        ) : null}
                        {quoteNegotiations.map((negotiation) => (
                          <View key={negotiation.id} style={styles.negotiationRow}>
                            <Text style={styles.negotiationMeta}>
                              {formatStatusLabel(negotiation.status)}
                              {negotiation.offer_amount_cents ? ` · ${formatCadCents(negotiation.offer_amount_cents)}` : ''}
                            </Text>
                            <Text style={styles.negotiationNote} numberOfLines={2}>{negotiation.scope_note}</Text>
                            {negotiation.company_response_note ? (
                              <Text style={styles.negotiationResponse} numberOfLines={2}>Trade: {negotiation.company_response_note}</Text>
                            ) : null}
                            {negotiation.status === 'pending' && canManageTradeRequests ? (
                              <GlassButton
                                label="Cancel Request"
                                onPress={() => handleCancelNegotiation(negotiation)}
                                loading={cancellingNegotiationId === negotiation.id}
                                disabled={!canManageTradeRequests || !!cancellingNegotiationId}
                                variant="secondary"
                                size="sm"
                                style={styles.cancelNegotiationButton}
                              />
                            ) : null}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </GlassCard>
              ) : null}

              {assignment?.status === 'active' && gcReady && selectedQuoteId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Counteroffer / revision request</Text>
                  <Text style={styles.bodyText}>
                    Send pricing or scope feedback to the trade. This does not change the homeowner quote until the trade submits an updated quote package.
                  </Text>
                  <GlassInput
                    label="Counter amount CAD"
                    value={counterAmount}
                    onChangeText={setCounterAmount}
                    keyboardType="decimal-pad"
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Revision notes"
                    value={counterNote}
                    onChangeText={setCounterNote}
                    containerStyle={styles.formInput}
                  />
                  <GlassButton
                    label="Send to Trade"
                    onPress={handleSendNegotiation}
                    loading={submitting}
                    fullWidth
                    size="sm"
                    style={styles.submitButton}
                  />
                </GlassCard>
              ) : null}

              {assignment?.status === 'active' && gcReady && selectedSlotId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Recommend trade change</Text>
                  <Text style={styles.bodyText}>
                    This creates a homeowner approval request. Approval records the recommendation as an unverified external trade with no WalkerAI escrow protection.
                  </Text>
                  {selectedSlotHasAssignedCompany ? (
                    <Text style={styles.warning}>
                      This slot already has a WalkerAI company. Homeowner approval can replace it only before that quote is funded; funded quotes stay locked until escrow and milestones are resolved.
                    </Text>
                  ) : null}
                  {selectedSlotHasApprovedQuote ? (
                    <Text style={styles.warning}>
                      Replacement is locked because this slot already has a funded quote.
                    </Text>
                  ) : null}
                  <GlassInput
                    label="Recommended trade contact"
                    value={recommendedTradeName}
                    onChangeText={setRecommendedTradeName}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Company"
                    value={recommendedCompany}
                    onChangeText={setRecommendedCompany}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Email or phone"
                    value={recommendedContact}
                    onChangeText={setRecommendedContact}
                    autoCapitalize="none"
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Cost +/- CAD"
                    value={costDelta}
                    onChangeText={setCostDelta}
                    keyboardType="numbers-and-punctuation"
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Recommendation notes"
                    value={recommendationNote}
                    onChangeText={setRecommendationNote}
                    containerStyle={styles.formInput}
                  />
                  <GlassButton
                    label="Send Trade Recommendation"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={submitting || selectedSlotHasApprovedQuote}
                    fullWidth
                    size="sm"
                    style={styles.submitButton}
                  />
                </GlassCard>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  headerBody: { flex: 1 },
  title: { ...Typography.h2 },
  subtitle: { ...Typography.bodySecondary, marginTop: 2 },
  card: { marginBottom: Spacing.sm },
  cardSelected: { borderColor: 'rgba(255,107,0,0.7)' },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  emptyHint: { ...Typography.caption, marginTop: 10, lineHeight: 18 },
  actionButton: { marginTop: Spacing.sm },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
  },
  slotBody: { flex: 1 },
  slotTitle: { ...Typography.body, fontWeight: '800' },
  slotMeta: { ...Typography.caption, marginTop: 3 },
  description: { ...Typography.caption, marginTop: 10, lineHeight: 18 },
  metricRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metric: {
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    padding: 10,
  },
  metricLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', fontWeight: '800' },
  metricValue: { fontSize: 12, color: Colors.text.primary, fontWeight: '800', marginTop: 5 },
  warning: { ...Typography.caption, color: Colors.warning, marginTop: 10, lineHeight: 17 },
  quoteList: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.glass.border },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  quoteRowSelected: {
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  quoteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  quoteBody: { flex: 1 },
  quoteTitle: { ...Typography.body, fontWeight: '700' },
  quoteMeta: { ...Typography.caption, marginTop: 3 },
  quoteAmount: { ...Typography.body, fontWeight: '900' },
  quoteActions: { alignItems: 'flex-end', gap: 6 },
  negotiateButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  negotiateText: { ...Typography.caption, fontWeight: '800', color: Colors.accent },
  negotiationRow: {
    marginLeft: 18,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.surface.border,
    paddingLeft: 10,
  },
  negotiationMeta: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '800' },
  negotiationNote: { ...Typography.caption, marginTop: 3, lineHeight: 17 },
  negotiationResponse: { ...Typography.caption, color: Colors.success, marginTop: 3, lineHeight: 17 },
  cancelNegotiationButton: { marginTop: 8, alignSelf: 'flex-start' },
  formInput: { marginBottom: Spacing.sm },
  submitButton: { marginTop: 2 },
});
