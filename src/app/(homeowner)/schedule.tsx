import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import {
  groupHomeownerScheduleItems,
  mapHomeownerScheduleItems,
  type HomeownerScheduleItem,
  type ScheduleProject,
} from '@/lib/homeowner-schedule';
import { GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusVariant(status: string) {
  if (status === 'scheduled' || status === 'pending') return 'pending';
  if (status === 'started' || status === 'in_progress') return 'active';
  if (status === 'completed' || status === 'homeowner_approved' || status === 'paid') return 'completed';
  return 'neutral';
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [items, setItems] = useState<HomeownerScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    if (!user) {
      setItems([]);
      setErrorMessage('Sign in again to view your schedule.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setErrorMessage(null);
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('id, address, city, room_type')
      .eq('homeowner_id', user.id)
      .not('status', 'eq', 'diy_saved')
      .order('created_at', { ascending: false });

    if (projectsError) {
      setItems([]);
      setErrorMessage(formatAppSafeErrorMessage(projectsError, 'Could not load schedule.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const projects = (projectsData ?? []) as ScheduleProject[];
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [slotsResult, milestonesResult] = await Promise.all([
      supabase
        .from('project_slots')
        .select('id, project_id, trade_type, status, scheduled_start_date, scheduled_end_date, companies(name)')
        .in('project_id', projectIds)
        .not('scheduled_start_date', 'is', null)
        .order('scheduled_start_date', { ascending: true }),
      supabase
        .from('milestones')
        .select('id, title, amount, status, due_date, quote:quotes!inner(project_id, status)')
        .in('quote.project_id', projectIds)
        .eq('quote.status', 'approved')
        .not('due_date', 'is', null)
        .not('status', 'eq', 'paid')
        .order('due_date', { ascending: true }),
    ]);

    if (slotsResult.error || milestonesResult.error) {
      setItems([]);
      setErrorMessage(formatAppSafeErrorMessage(slotsResult.error ?? milestonesResult.error, 'Could not load schedule.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setItems(mapHomeownerScheduleItems(projects, (slotsResult.data ?? []) as any[], (milestonesResult.data ?? []) as any[]));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSchedule();
  };

  const groups = groupHomeownerScheduleItems(items);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            showsVerticalScrollIndicator={false}
          >
            {errorMessage ? (
              <View style={styles.emptyCard}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>Could not load schedule</Text>
                <Text style={styles.emptySub}>{errorMessage}</Text>
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>No upcoming appointments</Text>
                <Text style={styles.emptySub}>
                  Scheduled trades and approved quote milestone due dates will appear here once your project has assigned dates or approved milestones.
                </Text>
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('ProjectDetail', {
                        screen: item.type === 'trade' ? 'ProjectSchedule' : 'Milestones',
                        params: { id: item.projectId },
                      })}
                    >
                      <GlassCard style={styles.card}>
                        <View style={styles.cardRow}>
                          <View style={styles.iconWrap}>
                            <Ionicons
                              name={item.type === 'trade' ? 'calendar-outline' : 'flag-outline'}
                              size={18}
                              color={item.type === 'trade' ? '#60A5FA' : Colors.accent}
                            />
                          </View>
                          <View style={styles.cardBody}>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                            <Text style={styles.cardSubtitle} numberOfLines={2}>{item.subtitle}</Text>
                            <Text style={styles.cardDate}>
                              {formatDate(item.date)}
                              {item.endDate ? ` - ${formatDate(item.endDate)}` : ''}
                            </Text>
                          </View>
                          <View style={styles.cardRight}>
                            {item.amount != null && <Text style={styles.amount}>{formatCad(item.amount)}</Text>}
                            <StatusBadge label={formatStatusLabel(item.status)} variant={statusVariant(item.status)} />
                          </View>
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 120 },
  emptyCard: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
  group: { marginBottom: Spacing.md },
  groupLabel: { fontSize: 12, fontWeight: '800', color: Colors.text.tertiary, letterSpacing: 0.7, marginBottom: 10 },
  card: { marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.item,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, color: Colors.text.primary, fontWeight: '700', marginBottom: 3 },
  cardSubtitle: { fontSize: 12, color: Colors.text.secondary, lineHeight: 17, marginBottom: 5 },
  cardDate: { fontSize: 12, color: Colors.text.tertiary },
  cardRight: { alignItems: 'flex-end', gap: 8, maxWidth: 118 },
  amount: { fontSize: 13, color: Colors.text.primary, fontWeight: '700' },
});
