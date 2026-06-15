import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { isValidIsoDate } from '@/lib/dates';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { allSchedulableSlotsHaveApprovedQuotes } from '@/lib/project-activation';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

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
  description: string;
  status: string;
  assigned_company_id: string | null;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  companies?: { name: string; user_id: string } | Array<{ name: string; user_id: string }> | null;
}

interface QuoteApprovalRow {
  id: string;
  slot_id?: string | null;
  company_id: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Not set';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCompany(slot: Slot) {
  if (Array.isArray(slot.companies)) return slot.companies[0] ?? null;
  return slot.companies ?? null;
}

function isExternalSlot(slot: Slot) {
  return slot.fulfillment_type === 'external';
}

function isSchedulableSlot(slot: Slot) {
  return ['filled', 'scheduled'].includes(slot.status) && (!!slot.assigned_company_id || isExternalSlot(slot));
}

function slotParticipantName(slot: Slot) {
  if (isExternalSlot(slot)) {
    return slot.external_trade_name ?? slot.external_trade_company ?? 'Externally managed trade';
  }
  return getCompany(slot)?.name ?? 'Waiting for contractor';
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<{ id: string; field: 'start' | 'end' } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [dates, setDates] = useState<Record<string, { start: string; end: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    if (!projectId) {
      setSlots([]);
      setDates({});
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('project_slots')
      .select(`
        id, trade_type, description, status, assigned_company_id,
        fulfillment_type, external_trade_name, external_trade_company,
        scheduled_start_date, scheduled_end_date, companies(name, user_id)
      `)
      .eq('project_id', projectId)
      .order('created_at');

    if (error) {
      setSlots([]);
      setDates({});
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const slotRows = (data ?? []) as unknown as Slot[];
    setSlots(slotRows);
    // Pre-fill dates from existing values
    const initial: Record<string, { start: string; end: string }> = {};
    for (const s of slotRows) {
      initial[s.id] = {
        start: s.scheduled_start_date ?? '',
        end: s.scheduled_end_date ?? '',
      };
    }
    setDates(initial);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  async function handleConfirm() {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen this schedule from the project page and try again.');
      return;
    }

    const schedulableSlots = slots.filter(isSchedulableSlot);
    const walkerAiSchedulableSlots = schedulableSlots.filter((s) => !!s.assigned_company_id && !isExternalSlot(s));
    const unassignedSlots = slots.filter((s) => !isSchedulableSlot(s));

    if (slots.length === 0) {
      Alert.alert('No trades assigned', 'Trade slots will appear here after contractors accept the project.');
      return;
    }

    if (unassignedSlots.length > 0) {
      Alert.alert(
        'Trades still pending',
        'Every required trade must be accepted by a contractor before you can confirm the project schedule.'
      );
      return;
    }

    const allHaveDates = schedulableSlots.every((s) => dates[s.id]?.start);
    if (!allHaveDates) {
      Alert.alert('Missing dates', 'Please set a start date for every trade slot.');
      return;
    }

    const invalidDateSlot = schedulableSlots.find((s) => {
      const start = dates[s.id]?.start;
      const end = dates[s.id]?.end;
      return !isValidIsoDate(start) || (!!end && !isValidIsoDate(end));
    });
    if (invalidDateSlot) {
      Alert.alert('Invalid dates', 'Please use valid dates in YYYY-MM-DD format for every trade slot.');
      return;
    }

    const reversedDateSlot = schedulableSlots.find((s) => {
      const start = dates[s.id]?.start;
      const end = dates[s.id]?.end;
      return !!end && end < start;
    });
    if (reversedDateSlot) {
      Alert.alert('Invalid date range', 'End dates cannot be before start dates.');
      return;
    }

    setSaving(true);
    try {
      // Update each slot with its scheduled dates
      const slotUpdates = await Promise.all(
        schedulableSlots.map((s) =>
          supabase
            .from('project_slots')
            .update({
              scheduled_start_date: dates[s.id]?.start || null,
              scheduled_end_date: dates[s.id]?.end || null,
              status: 'scheduled',
            })
            .eq('id', s.id)
        )
      );
      const slotUpdateError = slotUpdates.find((result) => result.error)?.error;
      if (slotUpdateError) throw slotUpdateError;

      const scheduledStarts = schedulableSlots
        .map((s) => dates[s.id]?.start)
        .filter((date): date is string => !!date)
        .sort();

      const { data: pendingQuotes, error: pendingQuoteError } = await supabase
        .from('quotes')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'pending')
        .limit(1);
      if (pendingQuoteError) throw pendingQuoteError;

      const hasPendingQuotes = (pendingQuotes?.length ?? 0) > 0;
      let allRequiredQuotesApproved = false;
      if (!hasPendingQuotes) {
        let approvedQuotes: QuoteApprovalRow[] = [];
        const approvedQuoteResult = await supabase
          .from('quotes')
          .select('id, slot_id, company_id')
          .eq('project_id', projectId)
          .eq('status', 'approved');

        if (isMissingColumnError(approvedQuoteResult.error)) {
          const legacyApprovedQuoteResult = await supabase
            .from('quotes')
            .select('id, company_id')
            .eq('project_id', projectId)
            .eq('status', 'approved');
          if (legacyApprovedQuoteResult.error) throw legacyApprovedQuoteResult.error;
          approvedQuotes = (legacyApprovedQuoteResult.data ?? []).map((quote) => ({
            id: quote.id,
            slot_id: null,
            company_id: quote.company_id,
          }));
        } else {
          if (approvedQuoteResult.error) throw approvedQuoteResult.error;
          approvedQuotes = (approvedQuoteResult.data ?? []) as QuoteApprovalRow[];
        }

        allRequiredQuotesApproved = allSchedulableSlotsHaveApprovedQuotes(
          walkerAiSchedulableSlots,
          approvedQuotes
        );
      }

      const nextProjectStatus = hasPendingQuotes
        ? 'quoting'
        : allRequiredQuotesApproved
        ? 'active'
        : 'scheduling';

      // Confirm dates only. Stripe payment approval is the authority that activates the project.
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({
          scheduling_status: 'confirmed',
          scheduled_start_date: scheduledStarts[0] ?? null,
          status: nextProjectStatus,
        })
        .eq('id', projectId);
      if (projectUpdateError) throw projectUpdateError;

      if (nextProjectStatus === 'active') {
        supabase.functions.invoke('generate-material-orders', {
          body: { project_id: projectId },
        }).catch((materialOrderError) => {
          console.warn('generate-material-orders after schedule confirmation failed:', materialOrderError);
        });
      }

      // Notify each assigned contractor about their schedule
      const notifications = await Promise.all(
        schedulableSlots
          .filter((s) => s.assigned_company_id && getCompany(s)?.user_id)
          .map((s) =>
            supabase.from('notifications').insert({
              user_id: getCompany(s)!.user_id,
              type: 'schedule_confirmed',
              payload: {
                project_id: projectId,
                slot_id: s.id,
                trade_type: s.trade_type,
                start_date: dates[s.id]?.start || null,
                end_date: dates[s.id]?.end || null,
                message: `Your schedule has been confirmed. Start: ${formatDate(dates[s.id]?.start ?? null)}`,
                deep_link: `/(company)/job/${projectId}`,
              },
            })
          )
      );
      const notificationError = notifications.find((result) => result.error)?.error;
      if (notificationError) {
        console.warn('schedule_confirmed notification failed:', notificationError);
      }

      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to confirm schedule.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B00" />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!projectId) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.centered}>
          <Ionicons name="warning-outline" size={42} color={Colors.warning} />
          <Text style={styles.emptyTitle}>Project not found</Text>
          <Text style={styles.emptyText}>This schedule link is missing a project ID.</Text>
          <GlassButton label="Go back" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Confirm Schedule</Text>
            <Text style={styles.headerSub}>Set start dates for each trade</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            All trade contractors have been assigned. Review the schedule below and set start dates before confirming.
          </Text>

          {errorMessage ? (
            <View style={styles.warningCard}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.warningText}>{errorMessage}</Text>
            </View>
          ) : null}

          {slots.map((slot) => {
            const d = dates[slot.id] ?? { start: null, end: null };
            const canSchedule = isSchedulableSlot(slot);

            return (
              <View key={slot.id} style={[styles.slotCard, !canSchedule && styles.slotCardPending]}>
                <View style={styles.slotHeader}>
                  <View style={styles.tradeIconWrap}>
                    <Ionicons name="construct-outline" size={20} color="#FF6B00" />
                  </View>
                  <View style={styles.slotInfo}>
                    <Text style={styles.tradeName}>{TRADE_LABELS[slot.trade_type] ?? slot.trade_type}</Text>
                    <Text style={styles.companyName}>{slotParticipantName(slot)}</Text>
                    {isExternalSlot(slot) ? (
                      <Text style={styles.externalNotice}>External scope is not managed by WalkerAI escrow.</Text>
                    ) : null}
                  </View>
                </View>

                {slot.description ? (
                  <Text style={styles.slotDesc}>{slot.description}</Text>
                ) : null}

                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateBtn, d.start && styles.dateBtnSet, !canSchedule && styles.dateBtnDisabled]}
                    disabled={!canSchedule}
                    onPress={() => { setPickerSlot({ id: slot.id, field: 'start' }); setInputValue(d.start ?? ''); }}
                  >
                    <Ionicons name="calendar-outline" size={14} color={d.start ? '#FF6B00' : Colors.text.tertiary} />
                    <Text style={[styles.dateBtnText, d.start && styles.dateBtnTextSet]}>
                      {canSchedule ? (d.start ? formatDate(d.start) : 'Set start date') : 'Pending'}
                    </Text>
                  </TouchableOpacity>

                  <Ionicons name="arrow-forward-outline" size={14} color={Colors.text.tertiary} style={styles.dateSeparatorIcon} />

                  <TouchableOpacity
                    style={[styles.dateBtn, d.end && styles.dateBtnSet, !canSchedule && styles.dateBtnDisabled]}
                    disabled={!canSchedule}
                    onPress={() => { setPickerSlot({ id: slot.id, field: 'end' }); setInputValue(d.end ?? ''); }}
                  >
                    <Ionicons name="flag-outline" size={14} color={d.end ? '#06B6D4' : Colors.text.tertiary} />
                    <Text style={[styles.dateBtnText, d.end && styles.dateBtnTextEndSet]}>
                      {d.end ? formatDate(d.end) : 'Set end date'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Date input modal */}
        <Modal visible={!!pickerSlot} transparent animationType="slide" onRequestClose={() => setPickerSlot(null)}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity style={styles.modalDismiss} onPress={() => setPickerSlot(null)} />
            <View style={styles.pickerContainer}>
              <View style={styles.pickerToolbar}>
                <Text style={styles.pickerLabel}>
                  {pickerSlot?.field === 'start' ? 'Start Date' : 'End Date'}
                </Text>
                <TouchableOpacity onPress={() => {
                  const normalizedInput = inputValue.trim();
                  if (pickerSlot && isValidIsoDate(normalizedInput)) {
                    setDates((prev) => ({
                      ...prev,
                      [pickerSlot.id]: { ...prev[pickerSlot.id], [pickerSlot.field]: normalizedInput },
                    }));
                    setPickerSlot(null);
                  } else if (pickerSlot && !normalizedInput) {
                    setDates((prev) => ({
                      ...prev,
                      [pickerSlot.id]: { ...prev[pickerSlot.id], [pickerSlot.field]: '' },
                    }));
                    setPickerSlot(null);
                  } else {
                    Alert.alert('Invalid date', 'Please enter a date in YYYY-MM-DD format (e.g. 2026-06-15).');
                  }
                }}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.pickerHint}>Enter date in YYYY-MM-DD format</Text>
              <TextInput
                style={styles.dateInput}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="2026-06-15"
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="numbers-and-punctuation"
                autoFocus
                maxLength={10}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Bottom CTA */}
        <View style={styles.bottom}>
          <GlassButton
            label="Confirm Schedule"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleConfirm}
            loading={saving}
            icon={<Ionicons name="checkmark-circle" size={20} color="#000" />}
          />
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 1 },

  scroll: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.xs },
  intro: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },

  slotCard: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  slotCardPending: {
    opacity: 0.72,
  },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  tradeIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,107,0,0.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  slotInfo: { flex: 1 },
  tradeName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  companyName: { fontSize: 12, color: Colors.text.secondary, marginTop: 2 },
  externalNotice: { fontSize: 11, color: Colors.warning, marginTop: 3, lineHeight: 15 },
  slotDesc: { fontSize: 13, color: Colors.text.secondary, lineHeight: 18, marginBottom: 10 },

  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateSeparatorIcon: { marginHorizontal: 6 },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.item, borderWidth: 1, borderColor: Colors.glass.border,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  dateBtnSet: { borderColor: 'rgba(255,107,0,0.4)', backgroundColor: 'rgba(255,107,0,0.06)' },
  dateBtnDisabled: { opacity: 0.55 },
  dateBtnText: { fontSize: 12, color: Colors.text.tertiary, flex: 1 },
  dateBtnTextSet: { color: '#FF6B00' },
  dateBtnTextEndSet: { color: '#06B6D4' },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.22)',
    borderRadius: Radius.item,
    padding: 12,
    marginBottom: Spacing.sm,
  },
  warningText: { flex: 1, fontSize: 13, color: Colors.text.secondary, lineHeight: 18 },
  bottomSpacer: { height: 120 },

  modalOverlay: { flex: 1 },
  modalDismiss: { flex: 1 },
  pickerContainer: {
    backgroundColor: '#1A1A2E',
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    paddingBottom: 32,
  },
  pickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  pickerLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pickerDone: { fontSize: 15, color: '#FF6B00', fontWeight: '600' },
  pickerHint: { fontSize: 12, color: Colors.text.tertiary, paddingHorizontal: 20, paddingTop: 12, marginBottom: 6 },
  dateInput: {
    marginHorizontal: 20,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },

  bottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
});
