import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase/client';
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
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  companies?: { name: string } | null;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Not set';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id: projectId } = route.params as { id: string };

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<{ id: string; field: 'start' | 'end' } | null>(null);
  const [dates, setDates] = useState<Record<string, { start: Date | null; end: Date | null }>>({});

  useEffect(() => {
    loadSlots();
  }, []);

  async function loadSlots() {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_slots')
      .select('id, trade_type, description, status, assigned_company_id, scheduled_start_date, scheduled_end_date, companies(name)')
      .eq('project_id', projectId)
      .order('created_at');

    if (!error && data) {
      setSlots(data);
      // Pre-fill dates from existing values
      const initial: Record<string, { start: Date | null; end: Date | null }> = {};
      for (const s of data) {
        initial[s.id] = {
          start: s.scheduled_start_date ? new Date(s.scheduled_start_date) : null,
          end: s.scheduled_end_date ? new Date(s.scheduled_end_date) : null,
        };
      }
      setDates(initial);
    }
    setLoading(false);
  }

  async function handleConfirm() {
    const allHaveDates = slots.every((s) => dates[s.id]?.start);
    if (!allHaveDates) {
      Alert.alert('Missing dates', 'Please set a start date for every trade slot.');
      return;
    }

    setSaving(true);
    try {
      // Update each slot with its scheduled dates
      await Promise.all(
        slots.map((s) =>
          supabase
            .from('project_slots')
            .update({
              scheduled_start_date: dates[s.id]?.start?.toISOString().split('T')[0] ?? null,
              scheduled_end_date: dates[s.id]?.end?.toISOString().split('T')[0] ?? null,
              status: 'scheduled',
            })
            .eq('id', s.id)
        )
      );

      // Confirm project scheduling
      await supabase
        .from('projects')
        .update({ scheduling_status: 'confirmed' })
        .eq('id', projectId);

      // Notify each assigned contractor about their schedule
      await Promise.all(
        slots
          .filter((s) => s.assigned_company_id)
          .map((s) =>
            supabase.from('notifications').insert({
              user_id: s.assigned_company_id,
              type: 'schedule_confirmed',
              payload: {
                project_id: projectId,
                slot_id: s.id,
                trade_type: s.trade_type,
                start_date: dates[s.id]?.start?.toISOString().split('T')[0],
                end_date: dates[s.id]?.end?.toISOString().split('T')[0],
                message: `Your schedule has been confirmed. Start: ${formatDate(dates[s.id]?.start?.toISOString().split('T')[0] ?? null)}`,
                deep_link: `/(company)/job/${projectId}`,
              },
            })
          )
      );

      // Trigger material orders generation now that schedule is set
      supabase.functions.invoke('generate-material-orders', {
        body: { project_id: projectId },
      }).catch(() => {});

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

          {slots.map((slot) => {
            const company = slot.companies as { name: string } | null;
            const d = dates[slot.id] ?? { start: null, end: null };

            return (
              <View key={slot.id} style={styles.slotCard}>
                <View style={styles.slotHeader}>
                  <View style={styles.tradeIconWrap}>
                    <Ionicons name="construct-outline" size={20} color="#FF6B00" />
                  </View>
                  <View style={styles.slotInfo}>
                    <Text style={styles.tradeName}>{TRADE_LABELS[slot.trade_type] ?? slot.trade_type}</Text>
                    <Text style={styles.companyName}>{company?.name ?? 'Assigned'}</Text>
                  </View>
                </View>

                {slot.description ? (
                  <Text style={styles.slotDesc}>{slot.description}</Text>
                ) : null}

                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateBtn, d.start && styles.dateBtnSet]}
                    onPress={() => setPickerSlot({ id: slot.id, field: 'start' })}
                  >
                    <Ionicons name="calendar-outline" size={14} color={d.start ? '#FF6B00' : Colors.text.tertiary} />
                    <Text style={[styles.dateBtnText, d.start && styles.dateBtnTextSet]}>
                      {d.start ? formatDate(d.start.toISOString()) : 'Set start date'}
                    </Text>
                  </TouchableOpacity>

                  <Ionicons name="arrow-forward-outline" size={14} color={Colors.text.tertiary} style={{ marginHorizontal: 6 }} />

                  <TouchableOpacity
                    style={[styles.dateBtn, d.end && styles.dateBtnSet]}
                    onPress={() => setPickerSlot({ id: slot.id, field: 'end' })}
                  >
                    <Ionicons name="flag-outline" size={14} color={d.end ? '#06B6D4' : Colors.text.tertiary} />
                    <Text style={[styles.dateBtnText, d.end && { color: '#06B6D4' }]}>
                      {d.end ? formatDate(d.end.toISOString()) : 'Set end date'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Date Picker (iOS inline) */}
        {pickerSlot && (
          <View style={styles.pickerContainer}>
            <View style={styles.pickerToolbar}>
              <Text style={styles.pickerLabel}>
                {pickerSlot.field === 'start' ? 'Start Date' : 'End Date'}
              </Text>
              <TouchableOpacity onPress={() => setPickerSlot(null)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={dates[pickerSlot.id]?.[pickerSlot.field] ?? new Date()}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              textColor="#fff"
              onChange={(_, date) => {
                if (date) {
                  setDates((prev) => ({
                    ...prev,
                    [pickerSlot.id]: {
                      ...prev[pickerSlot.id],
                      [pickerSlot.field]: date,
                    },
                  }));
                }
              }}
            />
          </View>
        )}

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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  tradeIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,107,0,0.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  slotInfo: { flex: 1 },
  tradeName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  companyName: { fontSize: 12, color: Colors.text.secondary, marginTop: 2 },
  slotDesc: { fontSize: 13, color: Colors.text.secondary, lineHeight: 18, marginBottom: 10 },

  dateRow: { flexDirection: 'row', alignItems: 'center' },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.item, borderWidth: 1, borderColor: Colors.glass.border,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  dateBtnSet: { borderColor: 'rgba(255,107,0,0.4)', backgroundColor: 'rgba(255,107,0,0.06)' },
  dateBtnText: { fontSize: 12, color: Colors.text.tertiary, flex: 1 },
  dateBtnTextSet: { color: '#FF6B00' },

  pickerContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#1A1A2E',
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  pickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  pickerLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pickerDone: { fontSize: 15, color: '#FF6B00', fontWeight: '600' },

  bottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
});
