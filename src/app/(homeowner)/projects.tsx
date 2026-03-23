import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { ProgressRing } from '@/components/dashboard/ProgressRing';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DashboardProject, PROJECTS_LIST } from '@/components/dashboard/data';

const FILTERS = ['All', 'Active', 'Quoting', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_MAP: Record<Filter, string[]> = {
  All: [],
  Active: ['active', 'draft', 'dispatching', 'accepted'],
  Quoting: ['quoting'],
  Completed: ['completed'],
};

export default function HomeownerProjects() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<Filter>('All');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () =>
      filter === 'All'
        ? PROJECTS_LIST
        : PROJECTS_LIST.filter((p) => STATUS_MAP[filter].includes(p.status)),
    [filter],
  );

  const counts = useMemo(() => ({
    active: PROJECTS_LIST.filter((p) => STATUS_MAP.Active.includes(p.status)).length,
    quoting: PROJECTS_LIST.filter((p) => p.status === 'quoting').length,
    completed: PROJECTS_LIST.filter((p) => p.status === 'completed').length,
  }), []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const renderProject = ({ item }: { item: DashboardProject }) => (
    <AnimatedPressable
      style={styles.card}
      haptic
      onPress={() => navigation.navigate('ProjectDetailView', { project: item })}
    >
      {/* Cover */}
      <Image source={{ uri: item.coverImage }} style={styles.cover} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gradient} />

      {/* Status badge */}
      <View style={[styles.badge, { backgroundColor: item.statusColor + '22', borderColor: item.statusColor + '55' }]}>
        <View style={[styles.badgeDot, { backgroundColor: item.statusColor }]} />
        <Text style={[styles.badgeText, { color: item.statusColor }]}>{item.statusLabel}</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.address} numberOfLines={1}>
              <Ionicons name="location-outline" size={11} color={Colors.text.tertiary} /> {item.address}
            </Text>
          </View>
          <ProgressRing progress={item.progress} size={44} color={item.statusColor} />
        </View>

        <View style={styles.footer}>
          <View style={styles.contractorRow}>
            {item.contractorAvatar ? (
              <Image source={{ uri: item.contractorAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={10} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            <Text style={styles.contractorName} numberOfLines={1}>{item.contractor}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.budget}>{item.budget}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.dueDate}>{item.dueDate}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Projects</Text>
          <View style={styles.headerActions}>
            <AnimatedPressable haptic onPress={() => navigation.navigate('Search')}>
              <Ionicons name="search-outline" size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable style={styles.addBtn} haptic onPress={() => navigation.navigate('ProjectCreate')}>
              <Ionicons name="add" size={20} color="#000" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.statsText}>
          <Text style={styles.statNum}>{counts.active}</Text> Active · <Text style={styles.statNum}>{counts.quoting}</Text> Quoting · <Text style={styles.statNum}>{counts.completed}</Text> Completed
        </Text>

        {/* Filters */}
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <AnimatedPressable
              key={f}
              style={[styles.filterPill, filter === f && styles.filterActive]}
              haptic
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderProject}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No {filter.toLowerCase()} projects</Text>
              <GlassButton
                label="Start a Project"
                onPress={() => navigation.navigate('ProjectCreate')}
                variant="primary"
                size="sm"
                haptic
                style={{ marginTop: 12 }}
              />
            </View>
          }
        />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  statsText: { fontSize: 13, color: Colors.text.tertiary, paddingHorizontal: 16, marginBottom: 12 },
  statNum: { fontWeight: '700', color: Colors.text.secondary },

  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border },
  filterActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  filterTextActive: { color: '#000' },

  list: { paddingHorizontal: 16, paddingBottom: 150, gap: 14 },

  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border },
  cover: { width: '100%', height: 160, resizeMode: 'cover' },
  gradient: { position: 'absolute', left: 0, right: 0, top: 90, height: 70 },
  badge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  body: { padding: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  titleCol: { flex: 1, marginRight: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 3 },
  address: { fontSize: 12, color: Colors.text.tertiary },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  avatarPlaceholder: { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  contractorName: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', maxWidth: 120 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  budget: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  dot: { color: Colors.text.tertiary },
  dueDate: { fontSize: 11, color: Colors.text.tertiary },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
