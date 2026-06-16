import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad } from '@/lib/formatters';
import { mapCompanyCalendarMilestones, type CompanyCalendarMilestone } from '@/lib/company-calendar';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';
import { TradeMetricStrip, TradeScreenHeader } from '@/components/company/TradeUI';

type Milestone = CompanyCalendarMilestone;

function groupByDate(milestones: Milestone[]): { label: string; items: Milestone[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

  const groups: { today: Milestone[]; thisWeek: Milestone[]; later: Milestone[]; noDue: Milestone[] } = {
    today: [], thisWeek: [], later: [], noDue: [],
  };

  for (const m of milestones) {
    if (!m.due_date) {
      groups.noDue.push(m);
      continue;
    }
    const d = new Date(m.due_date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) groups.today.push(m);
    else if (d <= endOfWeek) groups.thisWeek.push(m);
    else groups.later.push(m);
  }

  const result: { label: string; items: Milestone[] }[] = [];
  if (groups.today.length) result.push({ label: 'TODAY', items: groups.today });
  if (groups.thisWeek.length) result.push({ label: 'THIS WEEK', items: groups.thisWeek });
  if (groups.later.length) result.push({ label: 'UPCOMING', items: groups.later });
  if (groups.noDue.length) result.push({ label: 'NO DUE DATE', items: groups.noDue });
  return result;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No date set';
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCompanyProfile, setHasCompanyProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setErrorMessage('You need to be signed in to view your calendar.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Get company
    setErrorMessage(null);
    const { data: co, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (companyError) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setErrorMessage(companyError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!co) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Get milestones from approved quotes for this company
    setHasCompanyProfile(true);
    const { data, error } = await supabase
      .from('milestones')
      .select(`
        id, title, amount, status, due_date,
        quote:quotes!inner ( company_id, status, slot_id, project:projects ( id, address, city, room_type ) )
      `)
      .eq('quote.company_id', co.id)
      .eq('quote.status', 'approved')
      .not('status', 'eq', 'paid')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) {
      setMilestones([]);
      setErrorMessage(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Flatten the nested join
    const mapped = mapCompanyCalendarMilestones((data ?? []) as any[]);

    setMilestones(mapped);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const groups = groupByDate(milestones);
  const openValue = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);

  const statusVariant = (s: string) => {
    if (s === 'pending') return 'pending';
    if (s === 'started' || s === 'in_progress') return 'active';
    if (s === 'completed' || s === 'homeowner_approved') return 'completed';
    return 'neutral';
  };

  return (
    <GradientBackground glow="none">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader title="Calendar" subtitle="Upcoming milestones and deadlines" />
          <TradeMetricStrip
            items={[
              { label: 'Open items', value: milestones.length, tone: milestones.length ? 'warning' : 'muted' },
              { label: 'Open value', value: openValue ? formatCad(openValue) : '$0', tone: openValue ? 'success' : 'muted' },
              { label: 'Today', value: groups.find((g) => g.label === 'TODAY')?.items.length ?? 0, tone: 'muted' },
            ]}
          />

          {loading ? (
            <>
              <ListItemSkeleton style={{ marginBottom: 12 }} />
              <ListItemSkeleton style={{ marginBottom: 12 }} />
              <ListItemSkeleton style={{ marginBottom: 12 }} />
            </>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Icon name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Could not load calendar</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
            </View>
          ) : !hasCompanyProfile ? (
            <View style={styles.emptyState}>
              <Icon name="domain" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Set up your company profile</Text>
              <Text style={styles.emptySub}>Complete contractor onboarding before tracking milestones.</Text>
              <TouchableOpacity style={styles.setupBtn} onPress={() => navigation.navigate('BusinessOnboarding')} activeOpacity={0.8}>
                <Text style={styles.setupBtnText}>Start Setup</Text>
              </TouchableOpacity>
            </View>
          ) : groups.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="calendar-blank-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No upcoming milestones</Text>
              <Text style={styles.emptySub}>
                Active project milestones and deadlines will appear here.
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.label}>
                <Text style={styles.sectionLabel}>{group.label}</Text>
                {group.items.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    activeOpacity={0.85}
                    disabled={!m.project.id}
                    onPress={() => navigation.navigate('JobDetail', {
                      screen: 'JobMilestones',
                      params: { id: m.project.id, slot: m.slot_id ?? undefined },
                    })}
                  >
                    <GlassCard style={styles.card}>
                      <View style={styles.cardRow}>
                        <View style={styles.cardIconWrap}>
                          <Icon name="flag-checkered" size={18} color={Colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{m.title}</Text>
                          <View style={styles.cardMeta}>
                            <Icon name={m.project.room_type === 'kitchen' ? 'countertop-outline' : 'shower'} size={13} color={Colors.text.tertiary} />
                            <Text style={styles.cardAddress}>{m.project.city || 'Location pending'}</Text>
                            <Text style={styles.cardDot}>·</Text>
                            <Text style={styles.cardDate}>{formatDate(m.due_date)}</Text>
                          </View>
                        </View>
                        <View style={styles.cardRight}>
                          <Text style={styles.cardAmount}>{formatCad(m.amount)}</Text>
                          <StatusBadge label={m.status.replace(/_/g, ' ')} variant={statusVariant(m.status)} />
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  title: { ...Typography.h1, marginBottom: 4 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  sectionLabel: { ...Typography.label, color: Colors.success, marginBottom: 10, marginTop: Spacing.sm },
  card: { marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { ...Typography.h3, marginBottom: 3 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardAddress: { ...Typography.caption, color: Colors.text.tertiary },
  cardDot: { color: Colors.text.tertiary, fontSize: 12 },
  cardDate: { ...Typography.caption, color: Colors.text.tertiary },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardAmount: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { ...Typography.h3, marginTop: Spacing.md, marginBottom: 8 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  setupBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, marginTop: 12 },
  setupBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
