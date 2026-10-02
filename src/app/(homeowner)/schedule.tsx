import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { groupHomeownerScheduleItems } from '@/lib/homeowner-schedule';
import { useHomeownerSchedule } from '@/lib/homeowner-data';
import { useSilentFocusRefetch } from '@/lib/silent-focus-refetch';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';
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
  const [refreshing, setRefreshing] = useState(false);
  const scheduleQuery = useHomeownerSchedule(user?.id);
  useSilentFocusRefetch(scheduleQuery.refetch);
  const items = scheduleQuery.data ?? [];
  const showSkeleton = !!user?.id && !scheduleQuery.data && scheduleQuery.isLoading;
  const errorMessage = !user?.id
    ? 'Sign in again to view your schedule.'
    : scheduleQuery.error
      ? formatAppSafeErrorMessage(scheduleQuery.error, 'Could not load schedule.')
      : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await scheduleQuery.refetch();
    setRefreshing(false);
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

        {showSkeleton ? (
          <View style={styles.skeletonWrap}>
            <ListItemSkeleton style={styles.skeletonItem} />
            <ListItemSkeleton style={styles.skeletonItem} />
            <ListItemSkeleton style={styles.skeletonItem} />
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
                <GlassButton label="Try Again" onPress={() => { void scheduleQuery.refetch(); }} size="sm" style={{ marginTop: 8 }} />
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
  skeletonWrap: { paddingHorizontal: 16, paddingTop: 8 },
  skeletonItem: { marginBottom: 12 },
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
