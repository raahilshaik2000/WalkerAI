import { useState } from 'react';
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

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
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

export default function QuoteBuilderScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const slotId: string | undefined = route.params?.slot;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const acceptedCounterofferCents = positiveCentsParam(route.params?.accepted_counteroffer_cents);

  const [lineItems, setLineItems] = useState<LineItem[]>(() => defaultLineItems(acceptedCounterofferCents));
  const [milestones, setMilestones] = useState<MilestoneInput[]>(() => defaultMilestones(acceptedCounterofferCents));
  const [notes, setNotes] = useState(() => defaultNotes(route.params?.gc_negotiation_note));
  const [submitting, setSubmitting] = useState(false);

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
    let createdQuoteId: string | null = null;
    let coreQuoteSaved = false;
    try {
      // Get company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company) throw new Error('Company not found');

      const [{ data: projectAssignment, error: projectAssignmentError }, { data: assignedSlots, error: slotsError }] = await Promise.all([
        supabase
          .from('projects')
          .select('assigned_company_id')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select('id, assigned_company_id, status, trade_type')
          .eq('project_id', projectId)
          .eq('assigned_company_id', company.id)
          .in('status', ['filled', 'scheduled']),
      ]);

      if (projectAssignmentError) throw projectAssignmentError;
      if (slotsError) throw slotsError;

      const projectAssignedToCompany = projectAssignment?.assigned_company_id === company.id;
      const slotAssignedToCompany = (assignedSlots ?? []).some((slot) => (
        slot.assigned_company_id === company.id && ['filled', 'scheduled'].includes(slot.status)
      ));
      const assignedSlotRows = (assignedSlots ?? []) as Array<{ id: string; assigned_company_id: string | null; status: string; trade_type?: string | null }>;
      const routeSlot = slotId ? assignedSlotRows.find((slot) => slot.id === slotId) : null;
      if (slotId && !routeSlot) {
        throw new Error('This trade slot is not assigned to your company.');
      }

      if (!projectAssignedToCompany && !slotAssignedToCompany) {
        throw new Error('You can only submit a quote after accepting this project or one of its trade slots.');
      }

      const quoteSlotId = routeSlot?.id
        ?? (!projectAssignedToCompany && assignedSlotRows.length === 1 ? assignedSlotRows[0].id : null);

      if (!projectAssignedToCompany && !quoteSlotId) {
        throw new Error('Open this job from the specific trade slot you want to quote.');
      }

      let existingQuoteResult: any = await supabase
        .from('quotes')
        .select('id, status, submitted_at, slot_id, stripe_payment_intent_id')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .in('status', ['pending', 'approved'])
        .order('submitted_at', { ascending: false });

      if (isMissingColumnError(existingQuoteResult.error)) {
        existingQuoteResult = await supabase
          .from('quotes')
          .select('id, status, submitted_at')
          .eq('project_id', projectId)
          .eq('company_id', company.id)
          .in('status', ['pending', 'approved'])
          .order('submitted_at', { ascending: false });
      }

      if (existingQuoteResult.error) throw existingQuoteResult.error;
      const existingQuotes = ((existingQuoteResult.data ?? []) as Array<{
        id: string;
        status: string;
        submitted_at: string | null;
        slot_id?: string | null;
        stripe_payment_intent_id?: string | null;
      }>)
        .filter((quote) => {
          if (!('slot_id' in quote)) return true;
          return quoteSlotId ? quote.slot_id === quoteSlotId : quote.slot_id === null;
        });
      const existingQuote = existingQuotes[0];
      if (existingQuote?.status === 'approved') {
        throw new Error('This trade already has a paid quote from your company.');
      }
      if (existingQuote?.status === 'pending') {
        if (existingQuote.stripe_payment_intent_id) {
          throw new Error('The homeowner has already started payment for this quote. Ask them to reject it before submitting a revision.');
        }
        const { error: deleteExistingQuoteError } = await supabase
          .from('quotes')
          .delete()
          .eq('id', existingQuote.id)
          .eq('status', 'pending');
        if (deleteExistingQuoteError) {
          throw new Error(`Existing pending quote could not be replaced: ${deleteExistingQuoteError.message}`);
        }
      }

      // Create quote
      const quotePayload: Record<string, unknown> = {
        project_id: projectId,
        company_id: company.id,
        total_amount: totalAmountCents,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      };
      if (quoteSlotId) quotePayload.slot_id = quoteSlotId;

      let quoteResult = await supabase
        .from('quotes')
        .insert(quotePayload)
        .select('id')
        .maybeSingle();

      if (quoteSlotId && isMissingColumnError(quoteResult.error)) {
        const legacyPayload = { ...quotePayload };
        delete legacyPayload.slot_id;
        quoteResult = await supabase
          .from('quotes')
          .insert(legacyPayload)
          .select('id')
          .maybeSingle();
      }

      const { data: quote, error: quoteError } = quoteResult;
      if (quoteError) throw quoteError;
      if (!quote) throw new Error('Quote was not saved.');
      createdQuoteId = quote.id;

      // Insert milestones
      const milestoneRows = milestones.map((m, i) => ({
        quote_id: quote.id,
        title: m.title.trim(),
        amount: parseMoneyToCents(m.amount),
        status: 'pending',
        sort_order: i + 1,
        due_date: normalizeOptionalIsoDate(m.due_date, 'milestone due date'),
      }));

      const { error: msError } = await supabase.from('milestones').insert(milestoneRows);
      if (msError) throw msError;

      const noteText = notes.trim();
      const lineItemRows = [
        ...pricedLineItems.map((item, index) => ({
          quote_id: quote.id,
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
              quote_id: quote.id,
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

      if (lineItemRows.length > 0) {
        const { error: itemsError } = await supabase.from('quote_line_items').insert(lineItemRows);
        if (itemsError) {
          throw new Error(`Quote line items were not saved: ${itemsError.message}`);
        }
      }
      coreQuoteSaved = true;

      // Notify homeowner
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('homeowner_id')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) throw new Error('Project not found while notifying homeowner.');

      const { error: notificationError } = await supabase.from('notifications').insert({
        user_id: project.homeowner_id,
        type: 'quote_submitted',
        payload: {
          project_id: projectId,
          quote_id: quote.id,
          slot_id: quoteSlotId,
          total_amount: totalAmountCents,
          deep_link: `/(homeowner)/project/${projectId}/quote`,
        },
      });
      if (notificationError) {
        console.warn('quote_submitted notification failed:', notificationError);
      }

      Alert.alert(
        'Quote submitted!',
        'The homeowner has been notified. You\'ll get an update when they review your quote.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      let rollbackMessage: string | null = null;
      if (createdQuoteId && !coreQuoteSaved) {
        const { error: rollbackError } = await supabase.from('quotes').delete().eq('id', createdQuoteId);
        if (rollbackError) {
          rollbackMessage = ` Also, the partial quote could not be removed automatically: ${rollbackError.message}`;
        }
      }
      Alert.alert('Error', `${err instanceof Error ? err.message : 'Failed to submit quote.'}${rollbackMessage ?? ''}`);
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
              <Text style={styles.title}>Build Quote</Text>
              <View style={{ width: 48 }} />
            </View>

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
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },
  card: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, marginBottom: 8 },
  sectionSub: { ...Typography.caption, marginBottom: 14, lineHeight: 18 },
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
