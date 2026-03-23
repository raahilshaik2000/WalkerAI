import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { FAKE_SCHEDULE, ScheduleMilestone } from '@/components/dashboard/data';

const GROUPS = ['Today', 'This Week', 'Upcoming'] as const;

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();

  const grouped = GROUPS.map((g) => ({
    label: g,
    items: FAKE_SCHEDULE.filter((m) => m.group === g),
  })).filter((g) => g.items.length > 0);

  const renderMilestone = (item: ScheduleMilestone, isLast: boolean) => (
    <AnimatedPressable
      key={item.id}
      style={styles.row}
      haptic
      onPress={() => navigation.navigate('ProjectDetail', { projectId: item.projectId })}
    >
      {/* Timeline dot + line */}
      <View style={styles.timeline}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor:
                item.status === 'in_progress'
                  ? '#F59E0B'
                  : item.status === 'completed'
                  ? '#22C55E'
                  : Colors.surface.borderStrong,
            },
          ]}
        />
        {!isLast && <View style={styles.line} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.milestoneTitle}>{item.title}</Text>
        <Text style={styles.project}>{item.projectTitle}</Text>
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={11} color={Colors.text.tertiary} />
          <Text style={styles.date}>{item.date}</Text>
        </View>
      </View>

      {/* Status pill */}
      <View style={[styles.statusPill, { backgroundColor: item.statusColor + '22' }]}>
        <Text style={[styles.statusText, { color: item.statusColor }]}>
          {item.status === 'in_progress' ? 'In Progress' : item.status === 'completed' ? 'Done' : 'Upcoming'}
        </Text>
      </View>
    </AnimatedPressable>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>My Schedule</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map((item, i) =>
                renderMilestone(item, i === group.items.length - 1),
              )}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  group: { marginBottom: Spacing.md },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.tertiary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeline: { alignItems: 'center', width: 24, marginRight: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.surface.border,
    marginTop: 4,
    minHeight: 40,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 14,
    marginBottom: 10,
  },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  project: { fontSize: 12, color: Colors.text.secondary, marginBottom: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { fontSize: 11, color: Colors.text.tertiary },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    marginTop: 4,
    marginLeft: 8,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
});
