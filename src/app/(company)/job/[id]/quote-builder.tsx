import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents, parseNonNegativeCadToCents } from '@/lib/currency';
import { isValidIsoDate, normalizeOptionalIsoDate } from '@/lib/dates';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

interface LineItem {
  id: string;
  description: string;
  amount: string; // CAD dollars (string for input)
}

interface MilestoneInput {
  id: string;
  title: string;
  amount: string; // CAD dollars
  due_date: string;
}

interface ExistingQuote {
  id: string;
  total_amount: number;
  status: string;
  submitted_at: string | null;
  stripe_payment_intent_id: string | null;
}

interface ExistingLineItem {
  id: string;
  description: string;
  total_cost: number | null;
  sort_order: number | null;
}

interface ExistingMilestone {
  id: string;
  title: string;
  amount: number;
  due_date: string | null;
  status: string;
  sort_order: number | null;
}

interface CompanyProfileRef {
  id: string;
}

function formatTotal(items: LineItem[]): number {
  return items.reduce((s, i) => s + (parseMoneyToCents(i.amount) / 100), 0);
}

function totalCents(items: Array<{ amount: string }>): number {
  return items.reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
}

function formatCentsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function positiveCentsParam(value: unknown): number | null {
  const cents = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(cents) && cents > 0 ? Math.round(cents) : null;
}

function defaultMilestoneSplitCents(totalAmountCents: number, milestoneCount: number): number[] {
  if (milestoneCount <= 0) return [];
  if (milestoneCount === 3) {
    const deposit = Math.round(totalAmountCents * 0.3);
    const roughIn = Math.round(totalAmountCents * 0.4);
    return [deposit, roughIn, totalAmountCents - deposit - roughIn];
  }

  const baseAmount = Math.floor(totalAmountCents / milestoneCount);
  const split = Array.from({ length: milestoneCount }, () => baseAmount);
  split[milestoneCount - 1] += totalAmountCents - (baseAmount * milestoneCount);
  return split;
}

function parseMoneyToCents(value: string): number {
  return parseNonNegativeCadToCents(value) ?? 0;
}

function invalidMoneyInputs(items: Array<{ amount: string }>): string[] {
  return items
    .filter((item) => {
      const trimmed = item.amount.trim();
      if (!trimmed) return false;
      return parseNonNegativeCadToCents(trimmed) == null;
    })
    .map((item) => item.amount.trim());
}

function lineItemType(description: string, index: number): 'labour' | 'material' | 'other' {
  const normalized = description.toLowerCase();
  if (normalized.includes('material')) return 'material';
  if (normalized.includes('labour') || normalized.includes('labor')) return 'labour';
  return index === 0 ? 'labour' : index === 1 ? 'material' : 'other';
}

function defaultLineItems(counterofferCents: number | null): LineItem[] {
  if (!counterofferCents) {
    return [
      { id: '1', description: 'Labour', amount: '' },
      { id: '2', description: 'Materials', amount: '' },
    ];
  }

  return [
    { id: '1', description: 'Accepted GC counteroffer', amount: formatCentsInput(counterofferCents) },
  ];
}

function defaultMilestones(counterofferCents: number | null): MilestoneInput[] {
  const base = [
    { id: '1', title: 'Deposit (30%)', amount: '', due_date: '' },
    { id: '2', title: 'Rough-in complete (40%)', amount: '', due_date: '' },
    { id: '3', title: 'Project complete (30%)', amount: '', due_date: '' },
  ];

  if (!counterofferCents) return base;

  const split = defaultMilestoneSplitCents(counterofferCents, base.length);
  return base.map((milestone, index) => ({
    ...milestone,
    amount: formatCentsInput(split[index] ?? 0),
  }));
}

function defaultNotes(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? `GC negotiation: ${value.trim()}`
    : '';
}

function editableLineItemsFromQuote(items: ExistingLineItem[]): LineItem[] {
  const pricedItems = [...items]
    .filter((item) => (item.total_cost ?? 0) > 0 && !item.description.startsWith('Contractor notes:'))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (pricedItems.length === 0) return defaultLineItems(null);

  return pricedItems.map((item, index) => ({
    id: item.id || `existing-line-${index}`,
    description: item.description,
    amount: formatCentsInput(item.total_cost ?? 0),
  }));
}

function editableMilestonesFromQuote(items: ExistingMilestone[]): MilestoneInput[] {
  const sortedItems = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (sortedItems.length === 0) return defaultMilestones(null);

  return sortedItems.map((item, index) => ({
    id: item.id || `existing-milestone-${index}`,
    title: item.title,
    amount: formatCentsInput(item.amount),
    due_date: item.due_date ?? '',
  }));
}

function editableNotesFromQuote(items: ExistingLineItem[]): string {
  const noteItem = items.find((item) => item.description.startsWith('Contractor notes:'));
  return noteItem?.description.replace(/^Contractor notes:\s*/, '').trim() ?? '';
}

export default function QuoteBuilderScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const slotId = getRequiredStringParam(route.params, 'slot') ?? undefined;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const acceptedCounterofferCents = positiveCentsParam(route.params?.accepted_counteroffer_cents);

  const [lineItems, setLineItems] = useState<LineItem[]>(() => defaultLineItems(acceptedCounterofferCents));
  const [milestones, setMilestones] = useState<MilestoneInput[]>(() => defaultMilestones(acceptedCounterofferCents));
  const [notes, setNotes] = useState(() => defaultNotes(route.params?.gc_negotiation_note));
  const [submitting, setSubmitting] = useState(false);
  const [loadingApprovedQuote, setLoadingApprovedQuote] = useState(true);
  const [quoteReloadKey, setQuoteReloadKey] = useState(0);
  const [quoteLoadError, setQuoteLoadError] = useState<string | null>(null);
  const [approvedQuote, setApprovedQuote] = useState<ExistingQuote | null>(null);
  const [editingPendingQuote, setEditingPendingQuote] = useState<ExistingQuote | null>(null);
  const [approvedLineItems, setApprovedLineItems] = useState<ExistingLineItem[]>([]);
  const [approvedMilestones, setApprovedMilestones] = useState<ExistingMilestone[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadApprovedQuote() {
      if (!projectId) {
        setQuoteLoadError('Project is missing. Reopen this job from your dashboard.');
        setLoadingApprovedQuote(false);
        return;
      }

      try {
        setQuoteLoadError(null);
        setLoadingApprovedQuote(true);
        setEditingPendingQuote(null);
        let companyId: string | null = null;
        if (user?.id) {
          const companyResult = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (companyResult.error) throw companyResult.error;
          if (!cancelled && companyResult.data) {
            companyId = (companyResult.data as CompanyProfileRef).id;
          }
        }

        if (!companyId) {
          throw new Error('Company profile is required before quote pricing can be loaded.');
        }

        let query = supabase
          .from('quotes')
          .select('id, total_amount, status, submitted_at, stripe_payment_intent_id')
          .eq('project_id', projectId)
          .eq('company_id', companyId)
          .or('status.eq.approved,stripe_payment_intent_id.not.is.null')
          .order('submitted_at', { ascending: false })
          .limit(1);

        query = slotId ? query.eq('slot_id', slotId) : query.is('slot_id', null);

        const { data, error } = await query.maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          if (error) throw error;
          setApprovedQuote(null);
          setApprovedLineItems([]);
          setApprovedMilestones([]);
          if (!acceptedCounterofferCents) {
            let pendingQuoteQuery = supabase
              .from('quotes')
              .select('id, total_amount, status, submitted_at, stripe_payment_intent_id')
              .eq('project_id', projectId)
              .eq('company_id', companyId)
              .eq('status', 'pending')
              .is('stripe_payment_intent_id', null)
              .order('submitted_at', { ascending: false })
              .limit(1);

            pendingQuoteQuery = slotId ? pendingQuoteQuery.eq('slot_id', slotId) : pendingQuoteQuery.is('slot_id', null);

            const pendingQuoteResult = await pendingQuoteQuery.maybeSingle();
            if (cancelled) return;
            if (pendingQuoteResult.error) throw pendingQuoteResult.error;
            if (!cancelled && pendingQuoteResult.data) {
              const quote = pendingQuoteResult.data as ExistingQuote;
              const [itemsResult, milestonesResult] = await Promise.all([
                supabase
                  .from('quote_line_items')
                  .select('id, description, total_cost, sort_order')
                  .eq('quote_id', quote.id)
                  .order('sort_order', { ascending: true }),
                supabase
                  .from('milestones')
                  .select('id, title, amount, due_date, status, sort_order')
                  .eq('quote_id', quote.id)
                  .order('sort_order', { ascending: true }),
              ]);

              if (cancelled) return;
              if (itemsResult.error) throw itemsResult.error;
              if (milestonesResult.error) throw milestonesResult.error;

              if (!cancelled) {
                const existingLineItems = (itemsResult.data as ExistingLineItem[] | null) ?? [];
                const existingMilestones = (milestonesResult.data as ExistingMilestone[] | null) ?? [];
                setLineItems(editableLineItemsFromQuote(existingLineItems));
                setMilestones(editableMilestonesFromQuote(existingMilestones));
                setNotes(editableNotesFromQuote(existingLineItems));
                setEditingPendingQuote(quote);
              }
            }
          }
          setLoadingApprovedQuote(false);
          return;
        }

        const quote = data as ExistingQuote;
        setApprovedQuote(quote);

        const [itemsResult, milestonesResult] = await Promise.all([
          supabase
            .from('quote_line_items')
            .select('id, description, total_cost, sort_order')
            .eq('quote_id', quote.id)
            .order('sort_order', { ascending: true }),
          supabase
            .from('milestones')
            .select('id, title, amount, due_date, status, sort_order')
            .eq('quote_id', quote.id)
            .order('sort_order', { ascending: true }),
        ]);

        if (itemsResult.error) throw itemsResult.error;
        if (milestonesResult.error) throw milestonesResult.error;

        if (cancelled) return;
        setApprovedLineItems((itemsResult.data as ExistingLineItem[] | null) ?? []);
        setApprovedMilestones((milestonesResult.data as ExistingMilestone[] | null) ?? []);
        setLoadingApprovedQuote(false);
      } catch (err) {
        if (!cancelled) {
          setApprovedQuote(null);
          setApprovedLineItems([]);
          setApprovedMilestones([]);
          setEditingPendingQuote(null);
          setQuoteLoadError(formatAppSafeErrorMessage(err, 'Could not load quote pricing.'));
          setLoadingApprovedQuote(false);
        }
      }
    }

    loadApprovedQuote();

    return () => {
      cancelled = true;
    };
  }, [acceptedCounterofferCents, projectId, quoteReloadKey, slotId, user?.id]);

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { id: Date.now().toString(), description: '', amount: '' }]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, { id: Date.now().toString(), title: '', amount: '', due_date: '' }]);
  };

  const removeMilestone = (id: string) => {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMilestone = (id: string, field: keyof MilestoneInput, value: string) => {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const applyDefaultMilestoneSplit = () => {
    const quoteTotalCents = totalCents(lineItems);
    if (quoteTotalCents <= 0) {
      Alert.alert('Quote total required', 'Enter line item amounts before splitting milestones.');
      return;
    }

    const split = defaultMilestoneSplitCents(quoteTotalCents, milestones.length);
    setMilestones((prev) => prev.map((milestone, index) => ({
      ...milestone,
      amount: formatCentsInput(split[index] ?? 0),
    })));
  };

  const handleSubmit = async () => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen this job from your dashboard and try again.');
      return;
    }
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in again before submitting a quote.');
      return;
    }

    const invalidLineAmounts = invalidMoneyInputs(lineItems);
    if (invalidLineAmounts.length > 0) {
      Alert.alert('Invalid line item amount', 'Line item amounts must be positive numbers or blank.');
      return;
    }

    const invalidMilestoneAmounts = invalidMoneyInputs(milestones);
    if (invalidMilestoneAmounts.length > 0) {
      Alert.alert('Invalid milestone amount', 'Milestone amounts must be positive numbers.');
      return;
    }

    const totalDollars = formatTotal(lineItems);
    const totalAmountCents = totalCents(lineItems);
    if (totalDollars <= 0) {
      Alert.alert('Invalid quote', 'Please enter at least one line item with an amount.');
      return;
    }

    const pricedLineItems = lineItems
      .map((item, index) => ({
        ...item,
        description: item.description.trim(),
        amountCents: parseMoneyToCents(item.amount),
        index,
      }))
      .filter((item) => item.amountCents > 0);

    const unnamedItem = pricedLineItems.find((item) => !item.description);
    if (unnamedItem) {
      Alert.alert('Missing line item description', 'Every priced line item needs a description.');
      return;
    }

    const milestonesTotalCents = totalCents(milestones);
    const diffCents = Math.abs(milestonesTotalCents - totalAmountCents);
    if (diffCents > 1) {
      Alert.alert(
        'Milestone total mismatch',
        `Milestones total $${(milestonesTotalCents / 100).toFixed(2)} but quote total is $${(totalAmountCents / 100).toFixed(2)}. They should match.`
      );
      return;
    }

    for (const m of milestones) {
      const amountCents = parseMoneyToCents(m.amount);
      if (!m.title.trim() || amountCents <= 0) {
        Alert.alert('Incomplete milestones', 'Please fill in all milestone titles and amounts.');
        return;
      }
      try {
        normalizeOptionalIsoDate(m.due_date, 'milestone due date');
      } catch {
        Alert.alert('Invalid date', `Milestone "${m.title}" has an invalid due date. Use YYYY-MM-DD format.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const milestoneRows = milestones.map((m, i) => ({
        title: m.title.trim(),
        amount: parseMoneyToCents(m.amount),
        sort_order: i + 1,
        due_date: normalizeOptionalIsoDate(m.due_date, 'milestone due date'),
      }));

      const noteText = notes.trim();
      const lineItemRows = [
        ...pricedLineItems.map((item, index) => ({
          type: lineItemType(item.description, item.index),
          description: item.description,
          quantity: 1,
          unit: null,
          unit_cost: item.amountCents,
          total_cost: item.amountCents,
          sort_order: index + 1,
        })),
        ...(noteText
          ? [{
              type: 'other' as const,
              description: `Contractor notes: ${noteText}`,
              quantity: 1,
              unit: null,
              unit_cost: null,
              total_cost: null,
              sort_order: pricedLineItems.length + 1,
            }]
          : []),
      ];

      const { error: quoteError } = await supabase.rpc('submit_company_quote', {
        p_project_id: projectId,
        p_slot_id: slotId ?? null,
        p_total_amount: totalAmountCents,
        p_milestones: milestoneRows,
        p_line_items: lineItemRows,
      });
      if (quoteError) {
        throw quoteError;
      }

      Alert.alert(
        'Quote submitted!',
        'The homeowner has been notified. You\'ll get an update when they review your quote.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Could not submit quote', formatAppSafeErrorMessage(err, 'Please review the quote and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const quoteTotalCents = totalCents(lineItems);
  const milestoneTotalCents = totalCents(milestones);
  const milestoneBalanceCents = quoteTotalCents - milestoneTotalCents;
  const milestoneTotalsMatch = quoteTotalCents > 0 && Math.abs(milestoneBalanceCents) <= 1;
  const milestoneBalanceLabel = milestoneTotalsMatch
    ? 'Balanced'
    : milestoneBalanceCents >= 0
    ? `${formatCadCents(milestoneBalanceCents)} remaining`
    : `${formatCadCents(Math.abs(milestoneBalanceCents))} over`;
  const totalDollars = quoteTotalCents / 100;
  const splitLabel = milestones.length === 3 ? 'Split total 30/40/30' : 'Split total evenly';

  if (loadingApprovedQuote) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.bodySecondary}>Loading quote...</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (quoteLoadError) {
    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.title}>Quote Unavailable</Text>
              <View style={styles.headerSpacer} />
            </View>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Could not load quote pricing</Text>
              <Text style={styles.sectionSub}>{quoteLoadError}</Text>
              <Text style={styles.sectionSub}>
                Pricing is locked until WalkerAI can confirm whether this job already has an editable, approved, or funded quote.
              </Text>
            </GlassCard>

            <GlassButton
              label="Try Again"
              onPress={() => {
                setLoadingApprovedQuote(true);
                setQuoteLoadError(null);
                setQuoteReloadKey((current) => current + 1);
              }}
              fullWidth
              size="lg"
              haptic
            />
          </ScrollView>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (approvedQuote) {
    const paymentStarted = approvedQuote.status === 'pending' && !!approvedQuote.stripe_payment_intent_id;
    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.title}>{paymentStarted ? 'Payment Started' : 'Approved Quote'}</Text>
              <View style={styles.headerSpacer} />
            </View>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>{paymentStarted ? 'Quote payment in progress' : 'Funded quote'}</Text>
              <Text style={styles.approvedTotal}>{formatCadCents(approvedQuote.total_amount)}</Text>
              <Text style={styles.sectionSub}>
                {paymentStarted
                  ? 'The homeowner has already started payment for this quote. Ask them to reject it before submitting a revision.'
                  : 'This quote is already funded. Price changes after funding should be submitted as change orders.'}
              </Text>
            </GlassCard>

            {approvedLineItems.length > 0 ? (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Line Items</Text>
                {approvedLineItems.map((item) => (
                  <View key={item.id} style={styles.readOnlyRow}>
                    <Text style={styles.readOnlyLabel}>{item.description}</Text>
                    <Text style={styles.readOnlyValue}>
                      {item.total_cost != null ? formatCadCents(item.total_cost) : '-'}
                    </Text>
                  </View>
                ))}
              </GlassCard>
            ) : null}

            {approvedMilestones.length > 0 ? (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Payment Milestones</Text>
                {approvedMilestones.map((milestone) => (
                  <View key={milestone.id} style={styles.readOnlyRow}>
                    <View style={styles.readOnlyMilestoneBody}>
                      <Text style={styles.readOnlyLabel}>{milestone.title}</Text>
                      <Text style={styles.readOnlyStatus}>{milestone.status.replace(/_/g, ' ')}</Text>
                    </View>
                    <Text style={styles.readOnlyValue}>{formatCadCents(milestone.amount)}</Text>
                  </View>
                ))}
              </GlassCard>
            ) : null}

            <GlassButton
              label="Back to Job"
              onPress={() => navigation.goBack()}
              fullWidth
              size="lg"
              haptic
            />
          </ScrollView>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.title}>{editingPendingQuote ? 'Edit Quote' : 'Build Quote'}</Text>
              <View style={{ width: 48 }} />
            </View>

            {editingPendingQuote ? (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Pending quote loaded</Text>
                <Text style={styles.sectionSub}>
                  This unfunded quote is still editable. Submitting replaces it with this updated pricing package.
                </Text>
              </GlassCard>
            ) : null}

            {/* Line Items */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Line Items</Text>
              {lineItems.map((item) => (
                <View key={item.id} style={styles.lineItemRow}>
                  <TextInput
                    style={[styles.lineDesc, { color: Colors.text.primary }]}
                    value={item.description}
                    onChangeText={(v) => updateLineItem(item.id, 'description', v)}
                    placeholder="Description"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                  <View style={styles.lineAmountWrapper}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={[styles.lineAmount, { color: Colors.text.primary }]}
                      value={item.amount}
                      onChangeText={(v) => updateLineItem(item.id, 'amount', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                  {lineItems.length > 1 && (
                    <TouchableOpacity onPress={() => removeLineItem(item.id)} style={styles.removeBtn}>
                      <Icon name="close-circle" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={addLineItem} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add line item</Text>
              </TouchableOpacity>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalAmount}>
                  ${totalDollars.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </GlassCard>

            {/* Payment milestones */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Payment Milestones</Text>
              <Text style={styles.sectionSub}>
                Break your quote into milestone payments. Total must equal the quote total.
              </Text>
              <TouchableOpacity
                onPress={applyDefaultMilestoneSplit}
                style={styles.splitBtn}
                disabled={quoteTotalCents <= 0}
              >
                <Text style={[styles.splitBtnText, quoteTotalCents <= 0 && styles.splitBtnTextDisabled]}>
                  {splitLabel}
                </Text>
              </TouchableOpacity>
              <View style={styles.milestoneSummary}>
                <View style={styles.milestoneSummaryRow}>
                  <Text style={styles.milestoneSummaryLabel}>Quote total</Text>
                  <Text style={styles.milestoneSummaryValue}>{formatCadCents(quoteTotalCents)}</Text>
                </View>
                <View style={styles.milestoneSummaryRow}>
                  <Text style={styles.milestoneSummaryLabel}>Milestones</Text>
                  <Text style={styles.milestoneSummaryValue}>{formatCadCents(milestoneTotalCents)}</Text>
                </View>
                <View style={styles.milestoneSummaryRow}>
                  <Text style={styles.milestoneSummaryLabel}>Balance</Text>
                  <Text style={[styles.milestoneSummaryValue, milestoneTotalsMatch ? styles.milestoneBalanced : styles.milestoneMismatch]}>
                    {milestoneBalanceLabel}
                  </Text>
                </View>
              </View>
              {milestones.map((m, i) => (
                <View key={m.id} style={styles.milestoneInput}>
                  <Text style={styles.milestoneNum}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={styles.milestoneTitleRow}>
                      <TextInput
                        style={[styles.milestoneTitle, { flex: 1, color: Colors.text.primary }]}
                        value={m.title}
                        onChangeText={(v) => updateMilestone(m.id, 'title', v)}
                        placeholder="Milestone title"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                      {milestones.length > 1 && (
                        <TouchableOpacity onPress={() => removeMilestone(m.id)} style={styles.removeBtn}>
                          <Icon name="close-circle" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.milestoneAmountRow}>
                      <Text style={styles.dollarSign}>$</Text>
                      <TextInput
                        style={[styles.lineAmount, { flex: 1, color: Colors.text.primary }]}
                        value={m.amount}
                        onChangeText={(v) => updateMilestone(m.id, 'amount', v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                      <TextInput
                        style={[styles.dateInput, { color: Colors.text.primary, borderBottomColor: m.due_date && !isValidIsoDate(m.due_date) ? Colors.error : Colors.glass.border }]}
                        value={m.due_date}
                        onChangeText={(v) => updateMilestone(m.id, 'due_date', v)}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addMilestone} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add milestone</Text>
              </TouchableOpacity>
            </GlassCard>

            {/* Notes */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Notes for Homeowner</Text>
              <TextInput
                style={[styles.notesInput, { color: Colors.text.primary }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional details, assumptions, or terms…"
                placeholderTextColor={Colors.text.tertiary}
                multiline
                numberOfLines={4}
              />
            </GlassCard>

            <GlassButton
              label={`Submit Quote — $${totalDollars.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`}
              onPress={handleSubmit}
              loading={submitting}
              disabled={totalDollars <= 0 || !milestoneTotalsMatch}
              fullWidth
              size="lg"
              haptic
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  headerSpacer: { width: 48 },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },
  card: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, marginBottom: 8 },
  sectionSub: { ...Typography.caption, marginBottom: 14, lineHeight: 18 },
  approvedTotal: { fontSize: 30, fontWeight: '800', color: Colors.accent, marginBottom: 8 },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  readOnlyLabel: { flex: 1, color: Colors.text.primary, fontSize: 14, fontWeight: '600' },
  readOnlyMilestoneBody: { flex: 1 },
  readOnlyValue: { color: Colors.text.primary, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  readOnlyStatus: { color: Colors.text.tertiary, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  splitBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.item,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    marginBottom: 14,
  },
  splitBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '700' },
  splitBtnTextDisabled: { color: Colors.text.tertiary },
  milestoneSummary: {
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  milestoneSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  milestoneSummaryLabel: { ...Typography.caption },
  milestoneSummaryValue: { ...Typography.caption, color: Colors.text.primary, fontWeight: '800', textAlign: 'right' },
  milestoneBalanced: { color: Colors.success },
  milestoneMismatch: { color: Colors.warning },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  lineDesc: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  lineAmountWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
  },
  dollarSign: { color: Colors.text.secondary, fontSize: 15, marginRight: 2 },
  lineAmount: { flex: 1, fontSize: 15, textAlign: 'right' },
  removeBtn: { padding: 4 },
  removeBtnText: { color: Colors.error, fontSize: 14 },
  addBtn: { paddingVertical: 12 },
  addBtnText: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  totalLabel: { ...Typography.label },
  totalAmount: { fontSize: 22, fontWeight: '700', color: Colors.text.primary },
  milestoneInput: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
    marginBottom: 14,
  },
  milestoneNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.accent,
    color: '#fff',
    fontSize: 12, fontWeight: '700',
    textAlign: 'center', lineHeight: 24,
    marginTop: 8,
  },
  milestoneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  milestoneTitle: { fontSize: 14, borderBottomWidth: 1, borderBottomColor: Colors.glass.border, paddingBottom: 4 },
  milestoneAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { fontSize: 13, borderBottomWidth: 1, borderBottomColor: Colors.glass.border, paddingBottom: 2, width: 110 },
  notesInput: {
    fontSize: 14,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: 12,
  },
});
