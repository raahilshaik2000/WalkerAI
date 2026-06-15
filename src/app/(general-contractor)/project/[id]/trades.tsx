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
import { formatCadCents, parseSignedCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';

const TRADE_LABELS: Record<string, string> = {
  general_contractor: 'General Contractor',
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile Installer',
  cabinet_installer: 'Cabinet Installer',
  painter: 'Painter',
  flooring_installer: 'Flooring Installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

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
  total_amount: number;
  status: string;
  submitted_at: string | null;
  company?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

function formatTrade(tradeType: string) {
  return TRADE_LABELS[tradeType] ?? tradeType.replace(/_/g, ' ');
}

function getCompany(slot: Slot) {
  return Array.isArray(slot.assigned_company) ? slot.assigned_company[0] ?? null : slot.assigned_company ?? null;
}

function getQuoteCompany(quote: Quote) {
  return Array.isArray(quote.company) ? quote.company[0]?.name ?? null : quote.company?.name ?? null;
}

function estimateLabel(slot: Slot) {
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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [recommendedTradeName, setRecommendedTradeName] = useState('');
  const [recommendedCompany, setRecommendedCompany] = useState('');
  const [recommendedContact, setRecommendedContact] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [recommendationNote, setRecommendationNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');

      const [assignmentResult, slotResult, quoteResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('id, status, homeowner_id, general_contractor_id')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
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
          .select('id, slot_id, total_amount, status, submitted_at, company:companies!company_id(name)')
          .eq('project_id', projectId)
          .order('submitted_at', { ascending: false }),
      ]);

      if (assignmentResult.error) throw assignmentResult.error;
      if (slotResult.error) throw slotResult.error;
      if (quoteResult.error) throw quoteResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setSlots((slotResult.data ?? []) as Slot[]);
      setQuotes((quoteResult.data ?? []) as Quote[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load trade management.');
      setAssignment(null);
      setSlots([]);
      setQuotes([]);
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

  const selectSlot = (slot: Slot) => {
    setSelectedSlotId(slot.id);
    setRecommendedTradeName(slot.fulfillment_type === 'external' ? slot.external_trade_name ?? '' : '');
    setRecommendedCompany(slot.fulfillment_type === 'external' ? slot.external_trade_company ?? '' : '');
    setRecommendedContact('');
    setCostDelta('');
    setRecommendationNote('');
  };

  const handleSubmit = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before trade recommendations can be sent.');
      return;
    }
    const slot = slots.find((s) => s.id === selectedSlotId);
    if (!slot) {
      Alert.alert('Trade required', 'Choose the trade you want to recommend changing.');
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

    const currentCompany = getCompany(slot)?.name;
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
      Alert.alert('Could not send recommendation', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
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
            </GlassCard>
          ) : (
            <>
              {assignment?.status !== 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.bodyText}>Homeowner confirmation is required before trade recommendations can be sent.</Text>
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
                            name={slot.fulfillment_type === 'external' ? 'account-hard-hat-outline' : company ? 'account-check-outline' : 'account-search-outline'}
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
                          {slotQuotes.map((quote) => (
                            <View key={quote.id} style={styles.quoteRow}>
                              <View style={styles.quoteDot} />
                              <View style={styles.quoteBody}>
                                <Text style={styles.quoteTitle}>{getQuoteCompany(quote) ?? 'Contractor quote'}</Text>
                                <Text style={styles.quoteMeta}>{formatStatusLabel(quote.status)} · {formatDate(quote.submitted_at)}</Text>
                              </View>
                              <Text style={styles.quoteAmount}>{formatCadCents(quote.total_amount)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}

              {quotesBySlot.get('legacy')?.length ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Project-level quotes</Text>
                  {(quotesBySlot.get('legacy') ?? []).map((quote) => (
                    <View key={quote.id} style={styles.quoteRow}>
                      <View style={styles.quoteDot} />
                      <View style={styles.quoteBody}>
                        <Text style={styles.quoteTitle}>{getQuoteCompany(quote) ?? 'Contractor quote'}</Text>
                        <Text style={styles.quoteMeta}>{formatStatusLabel(quote.status)} · {formatDate(quote.submitted_at)}</Text>
                      </View>
                      <Text style={styles.quoteAmount}>{formatCadCents(quote.total_amount)}</Text>
                    </View>
                  ))}
                </GlassCard>
              ) : null}

              {assignment?.status === 'active' && selectedSlotId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Recommend trade change</Text>
                  <Text style={styles.bodyText}>
                    This creates a homeowner approval request. It does not replace a WalkerAI trade or add an external subcontractor automatically.
                  </Text>
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
  quoteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  quoteBody: { flex: 1 },
  quoteTitle: { ...Typography.body, fontWeight: '700' },
  quoteMeta: { ...Typography.caption, marginTop: 3 },
  quoteAmount: { ...Typography.body, fontWeight: '900' },
  formInput: { marginBottom: Spacing.sm },
  submitButton: { marginTop: 2 },
});
