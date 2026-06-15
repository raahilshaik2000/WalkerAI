import { useCallback, useState } from 'react';
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
import { isValidIsoDate } from '@/lib/dates';
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
  status: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  assigned_company?: { name: string | null } | Array<{ name: string | null }> | null;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
}

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

function getCompany(slot: Slot) {
  return Array.isArray(slot.assigned_company) ? slot.assigned_company[0] ?? null : slot.assigned_company ?? null;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Not set';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTrade(tradeType: string) {
  return TRADE_LABELS[tradeType] ?? tradeType.replace(/_/g, ' ');
}

export default function GeneralContractorScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      setErrorMessage('You need to be signed in to view scheduling.');
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

      const [assignmentResult, slotResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('id, status, homeowner_id, general_contractor_id')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select(`
            id, trade_type, description, status, scheduled_start_date, scheduled_end_date,
            fulfillment_type, external_trade_name,
            assigned_company:companies!assigned_company_id(name)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (slotResult.error) throw slotResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setSlots((slotResult.data ?? []) as Slot[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load schedule.');
      setAssignment(null);
      setSlots([]);
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
    setStartDate(slot.scheduled_start_date ?? '');
    setEndDate(slot.scheduled_end_date ?? '');
    setNote('');
  };

  const handleSubmit = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before schedule recommendations can be sent.');
      return;
    }
    const slot = slots.find((s) => s.id === selectedSlotId);
    if (!slot) {
      Alert.alert('Trade required', 'Choose the trade schedule you want to recommend.');
      return;
    }
    if (!isValidIsoDate(startDate.trim())) {
      Alert.alert('Start date required', 'Enter a valid start date in YYYY-MM-DD format.');
      return;
    }
    const normalizedEnd = endDate.trim();
    if (normalizedEnd && !isValidIsoDate(normalizedEnd)) {
      Alert.alert('Invalid end date', 'Enter the end date in YYYY-MM-DD format.');
      return;
    }
    if (normalizedEnd && normalizedEnd < startDate.trim()) {
      Alert.alert('Invalid date range', 'End date cannot be before the start date.');
      return;
    }

    setSubmitting(true);
    try {
      const title = `${formatTrade(slot.trade_type)} schedule recommendation`;
      const detail = note.trim()
        ? note.trim()
        : `Recommended start: ${formatDate(startDate.trim())}${normalizedEnd ? `, end: ${formatDate(normalizedEnd)}` : ''}.`;
      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: 'schedule_change',
        title,
        description: detail,
        timeline_delta_days: null,
        metadata: {
          slot_id: slot.id,
          scheduled_start_date: startDate.trim(),
          scheduled_end_date: normalizedEnd || null,
          trade_type: slot.trade_type,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', 'The homeowner must approve before schedule dates are applied.');
      setSelectedSlotId(null);
      setStartDate('');
      setEndDate('');
      setNote('');
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
              <Text style={styles.title}>Schedule Center</Text>
              <Text style={styles.subtitle}>Recommend dates. Homeowner approval applies the schedule.</Text>
            </View>
          </View>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading schedule...</Text>
            </GlassCard>
          ) : slots.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Trade slots have not been generated yet.</Text>
            </GlassCard>
          ) : (
            <>
              {assignment?.status !== 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.bodyText}>
                    Homeowner confirmation is required before schedule recommendations can be sent.
                  </Text>
                </GlassCard>
              ) : null}

              {slots.map((slot) => {
                const selected = selectedSlotId === slot.id;
                const participant = slot.fulfillment_type === 'external'
                  ? slot.external_trade_name ?? 'External trade'
                  : getCompany(slot)?.name ?? 'Unassigned';
                return (
                  <TouchableOpacity key={slot.id} onPress={() => selectSlot(slot)} activeOpacity={0.85}>
                    <GlassCard style={[styles.card, selected && styles.cardSelected]}>
                      <View style={styles.slotHeader}>
                        <View style={styles.slotIcon}>
                          <Icon name={slot.fulfillment_type === 'external' ? 'account-hard-hat-outline' : 'calendar-clock'} size={20} color={selected ? Colors.accent : Colors.text.secondary} />
                        </View>
                        <View style={styles.slotBody}>
                          <Text style={styles.slotTitle}>{formatTrade(slot.trade_type)}</Text>
                          <Text style={styles.slotMeta}>{participant}</Text>
                        </View>
                        <StatusBadge label={slot.fulfillment_type === 'external' ? 'external' : slot.status} variant={slot.status === 'scheduled' ? 'completed' : 'pending'} size="sm" />
                      </View>
                      <View style={styles.dateLine}>
                        <Text style={styles.dateText}>Start: {formatDate(slot.scheduled_start_date)}</Text>
                        <Text style={styles.dateText}>End: {formatDate(slot.scheduled_end_date)}</Text>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}

              {selectedSlotId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Recommend schedule</Text>
                  <View style={styles.row}>
                    <GlassInput
                      label="Start YYYY-MM-DD"
                      value={startDate}
                      onChangeText={setStartDate}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.halfInput}
                    />
                    <GlassInput
                      label="End YYYY-MM-DD"
                      value={endDate}
                      onChangeText={setEndDate}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.halfInput}
                    />
                  </View>
                  <GlassInput
                    label="Recommendation note"
                    value={note}
                    onChangeText={setNote}
                    containerStyle={styles.noteInput}
                  />
                  <GlassButton
                    label="Send Schedule for Approval"
                    onPress={handleSubmit}
                    loading={submitting}
                    fullWidth
                    size="sm"
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
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
  title: { ...Typography.h2, marginBottom: 3 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 21 },
  card: { marginBottom: Spacing.sm },
  cardSelected: { borderColor: 'rgba(255,107,0,0.65)' },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBody: { flex: 1 },
  slotTitle: { ...Typography.h3 },
  slotMeta: { ...Typography.caption, marginTop: 3 },
  dateLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  dateText: { ...Typography.caption, flex: 1 },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1, marginBottom: Spacing.sm },
  noteInput: { marginBottom: Spacing.sm },
});
