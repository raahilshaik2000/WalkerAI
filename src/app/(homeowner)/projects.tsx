import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { ProgressRing } from '@/components/dashboard/ProgressRing';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { useDIYWizardStore, type DIYGuide } from '@/stores/diy-wizard.store';

interface RealProject {
  id: string;
  room_type: string;
  status: string;
  description: string;
  address: string | null;
  city: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  created_at: string;
  renders: Array<{ url: string }>;
  project_photos: Array<{ url: string }>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:       { label: 'Setting up',          color: '#6B7280' },
  dispatching: { label: 'Finding contractor',  color: '#A78BFA' },
  quoting:     { label: 'Quote pending',        color: '#F59E0B' },
  accepted:    { label: 'Contractor reviewing', color: '#60A5FA' },
  active:      { label: 'In progress',          color: '#22C55E' },
  completed:   { label: 'Completed',            color: '#FF6B00' },
};

const CONTRACTOR_LABEL: Record<string, string> = {
  draft:       'Setting up',
  dispatching: 'Finding contractor',
  quoting:     'Quote received',
  accepted:    'Contractor reviewing',
  active:      'Contractor assigned',
  completed:   'Project complete',
};

const FILTERS = ['All', 'Active', 'Quoting', 'Completed', 'DIY'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_MAP: Record<Filter, string[]> = {
  All: [],
  Active: ['active', 'draft', 'dispatching', 'accepted'],
  Quoting: ['quoting'],
  Completed: ['completed'],
  DIY: ['diy_saved'],
};

interface DIYProject {
  id: string;
  description: string;
  room_type: string;
  created_at: string;
  diy_guide: DIYGuide;
}

const CATEGORY_ICONS: Record<string, string> = {
  plumbing: 'water-outline',
  electrical: 'flash-outline',
  carpentry: 'construct-outline',
  painting: 'color-palette-outline',
  flooring: 'layers-outline',
  hvac: 'thermometer-outline',
  landscaping: 'leaf-outline',
  general: 'home-outline',
};

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: '#34D399',
  Intermediate: '#F59E0B',
  Advanced: '#EF4444',
};

function DIYProjectCard({ item, onPress }: { item: DIYProject; onPress: () => void }) {
  const guide = item.diy_guide;
  const iconName = CATEGORY_ICONS[item.room_type] ?? 'hammer-outline';
  const diffColor = DIFFICULTY_COLOR[guide?.difficulty] ?? '#34D399';
  const stepCount = guide?.steps?.length ?? 0;
  const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <AnimatedPressable style={styles.diyCard} haptic onPress={onPress}>
      {/* Top accent bar */}
      <View style={styles.diyAccent} />

      <View style={styles.diyCardInner}>
        {/* Icon + Title row */}
        <View style={styles.diyTopRow}>
          <View style={styles.diyIconWrap}>
            <Ionicons name="hammer" size={22} color="#34D399" />
          </View>
          <View style={styles.diyTitleCol}>
            <Text style={styles.diyTitle} numberOfLines={2}>
              {guide?.title ?? item.description}
            </Text>
            <View style={styles.diyBadgeRow}>
              <View style={styles.diyCategory}>
                <Ionicons name={iconName} size={11} color={Colors.text.tertiary} />
                <Text style={styles.diyCategoryText}>
                  {item.room_type.charAt(0).toUpperCase() + item.room_type.slice(1)}
                </Text>
              </View>
              <View style={[styles.diyDifficulty, { borderColor: diffColor + '55', backgroundColor: diffColor + '15' }]}>
                <Text style={[styles.diyDifficultyText, { color: diffColor }]}>{guide?.difficulty}</Text>
              </View>
            </View>
          </View>
          <View style={styles.diyArrow}>
            <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.diyStatsRow}>
          <View style={styles.diyStat}>
            <Ionicons name="list-outline" size={14} color="#34D399" />
            <Text style={styles.diyStatText}>{stepCount} steps</Text>
          </View>
          <View style={styles.diyStatDivider} />
          <View style={styles.diyStat}>
            <Ionicons name="time-outline" size={14} color="#34D399" />
            <Text style={styles.diyStatText}>{guide?.estimated_time ?? '—'}</Text>
          </View>
          <View style={styles.diyStatDivider} />
          <View style={styles.diyStat}>
            <Ionicons name="cash-outline" size={14} color="#34D399" />
            <Text style={styles.diyStatText}>{guide?.total_estimated_cost ?? '—'}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.diyFooter}>
          <View style={styles.diyGuideLabel}>
            <Ionicons name="bookmark" size={12} color="#34D399" />
            <Text style={styles.diyGuideLabelText}>Saved Guide</Text>
          </View>
          <Text style={styles.diyDate}>{date}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function HomeownerProjects() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const diyStore = useDIYWizardStore();

  const [filter, setFilter] = useState<Filter>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<RealProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [diyProjects, setDiyProjects] = useState<DIYProject[]>([]);
  const [diyLoading, setDiyLoading] = useState(false);
  const [milestoneProgressMap, setMilestoneProgressMap] = useState<Record<string, number>>({});

  const filtered = useMemo(() => {
    if (filter === 'All') return projects;
    return projects.filter((p) => STATUS_MAP[filter].includes(p.status));
  }, [filter, projects]);

  const counts = useMemo(() => ({
    active: projects.filter((p) => STATUS_MAP.Active.includes(p.status)).length,
    quoting: projects.filter((p) => p.status === 'quoting').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }), [projects]);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setProjectsLoading(true);
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, room_type, status, description, address, city, ai_cost_min, ai_cost_max, created_at, renders(url), project_photos(url)')
        .eq('homeowner_id', user.id)
        .not('status', 'eq', 'diy_saved')
        .order('created_at', { ascending: false });
      const projectList = (data as RealProject[]) ?? [];
      setProjects(projectList);

      // Fetch milestone-based progress for all projects
      const ids = projectList.map((p) => p.id);
      if (ids.length > 0) {
        const { data: quoteData } = await supabase
          .from('quotes')
          .select('project_id, milestones(status)')
          .in('project_id', ids)
          .eq('status', 'approved');

        const progressMap: Record<string, number> = {};
        for (const q of quoteData ?? []) {
          const ms = (q.milestones as Array<{ status: string }>) ?? [];
          if (ms.length === 0) continue;
          progressMap[q.project_id] = ms.filter((m) => m.status === 'paid').length / ms.length;
        }
        setMilestoneProgressMap(progressMap);
      }
    } finally {
      setProjectsLoading(false);
    }
  }, [user]);

  const fetchDIYProjects = useCallback(async () => {
    if (!user) return;
    setDiyLoading(true);
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, description, room_type, created_at, diy_guide')
        .eq('homeowner_id', user.id)
        .eq('status', 'diy_saved')
        .not('diy_guide', 'is', null)
        .order('created_at', { ascending: false });
      setDiyProjects((data as DIYProject[]) ?? []);
    } finally {
      setDiyLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchProjects();
    }, [fetchProjects])
  );

  useEffect(() => {
    if (filter === 'DIY') fetchDIYProjects();
  }, [filter, fetchDIYProjects]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchProjects(),
      filter === 'DIY' ? fetchDIYProjects() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const openDIYGuide = (item: DIYProject) => {
    diyStore.setGuide(item.diy_guide);
    diyStore.setProjectId(item.id);
    navigation.navigate('DIYGuide');
  };

  const renderProject = ({ item }: { item: RealProject }) => {
    const statusInfo = STATUS_LABEL[item.status] ?? { label: item.status, color: '#6B7280' };
    const coverImage = item.renders?.[0]?.url ?? item.project_photos?.[0]?.url;
    const title = item.room_type
      ? item.room_type.charAt(0).toUpperCase() + item.room_type.slice(1) + ' Renovation'
      : item.description?.slice(0, 40) ?? 'Project';
    const location = [item.address, item.city].filter(Boolean).join(', ') || 'Address not set';
    const budgetText = item.ai_cost_min && item.ai_cost_max
      ? `$${Math.round(item.ai_cost_min / 100).toLocaleString()}–$${Math.round(item.ai_cost_max / 100).toLocaleString()}`
      : 'TBD';
    const progress = milestoneProgressMap[item.id]
      ?? (item.status === 'completed' ? 1 : item.status === 'active' ? 0.5 : item.status === 'quoting' || item.status === 'accepted' ? 0.2 : 0.1);

    return (
      <AnimatedPressable
        style={styles.card}
        haptic
        onPress={() => navigation.navigate('ProjectDetailView', { project: item })}
      >
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="home-outline" size={40} color="rgba(255,255,255,0.15)" />
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gradient} />
        <View style={[styles.badge, { backgroundColor: statusInfo.color + '22', borderColor: statusInfo.color + '55' }]}>
          <View style={[styles.badgeDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Text style={styles.address} numberOfLines={1}>
                <Ionicons name="location-outline" size={11} color={Colors.text.tertiary} /> {location}
              </Text>
            </View>
            <ProgressRing progress={progress} size={44} color={statusInfo.color} />
          </View>
          <View style={styles.footer}>
            <View style={styles.contractorRow}>
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={10} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.contractorName}>
                {CONTRACTOR_LABEL[item.status] ?? item.status}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.budget}>{budgetText}</Text>
            </View>
          </View>
        </View>
      </AnimatedPressable>
    );
  };

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
            <AnimatedPressable style={styles.diyBtn} haptic onPress={() => navigation.navigate('DIYCreate')}>
              <Ionicons name="hammer-outline" size={16} color="#fff" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.statsText}>
          <Text style={styles.statNum}>{counts.active}</Text> Active ·{' '}
          <Text style={styles.statNum}>{counts.quoting}</Text> Quoting ·{' '}
          <Text style={styles.statNum}>{counts.completed}</Text> Completed
        </Text>

        {/* Filters */}
        <View style={styles.filtersWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
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
          </ScrollView>
        </View>

        {/* DIY List */}
        {filter === 'DIY' ? (
          diyLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#34D399" size="large" />
            </View>
          ) : (
            <FlatList
              data={diyProjects}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <DIYProjectCard item={item} onPress={() => openDIYGuide(item)} />
              )}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34D399" />
              }
              ListEmptyComponent={
                <View style={styles.diyEmpty}>
                  <View style={styles.diyEmptyIcon}>
                    <Ionicons name="hammer" size={36} color="#34D399" />
                  </View>
                  <Text style={styles.diyEmptyTitle}>No DIY guides saved yet</Text>
                  <Text style={styles.diyEmptySub}>
                    Use the AI-powered DIY wizard to generate a step-by-step guide for any home project
                  </Text>
                  <TouchableOpacity
                    style={styles.diyEmptyBtn}
                    onPress={() => navigation.navigate('DIYCreate')}
                  >
                    <Ionicons name="hammer-outline" size={16} color="#000" />
                    <Text style={styles.diyEmptyBtnText}>Start a DIY Guide</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )
        ) : projectsLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.accent} size="large" />
          </View>
        ) : (
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
                  style={{ marginTop: 12, alignSelf: 'center' }}
                />
              </View>
            }
          />
        )}
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
  diyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#34D399', alignItems: 'center', justifyContent: 'center' },

  statsText: { fontSize: 13, color: Colors.text.tertiary, paddingHorizontal: 16, marginBottom: 12 },
  statNum: { fontWeight: '700', color: Colors.text.secondary },

  filtersWrapper: { height: 48, marginBottom: 12 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 48 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border },
  filterActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  filterTextActive: { color: '#000' },

  list: { paddingHorizontal: 16, paddingBottom: 150, gap: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Regular project card
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border },
  cover: { width: '100%', height: 160, resizeMode: 'cover' },
  coverPlaceholder: { backgroundColor: Colors.surface.default, alignItems: 'center', justifyContent: 'center' },
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

  // DIY project card
  diyCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)' },
  diyAccent: { height: 3, backgroundColor: '#34D399' },
  diyCardInner: { padding: 16 },
  diyTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  diyIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  diyTitleCol: { flex: 1 },
  diyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 6, lineHeight: 22 },
  diyBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  diyCategory: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.glass.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.glass.border, paddingHorizontal: 8, paddingVertical: 3 },
  diyCategoryText: { fontSize: 11, color: Colors.text.tertiary, fontWeight: '500' },
  diyDifficulty: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  diyDifficultyText: { fontSize: 11, fontWeight: '600' },
  diyArrow: { paddingTop: 4 },

  diyStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52,211,153,0.1)', padding: 12, marginBottom: 12 },
  diyStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  diyStatText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },
  diyStatDivider: { width: 1, height: 16, backgroundColor: 'rgba(52,211,153,0.2)' },

  diyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diyGuideLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  diyGuideLabelText: { fontSize: 12, color: '#34D399', fontWeight: '600' },
  diyDate: { fontSize: 11, color: Colors.text.tertiary },

  // DIY empty state
  diyEmpty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  diyEmptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  diyEmptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  diyEmptySub: { fontSize: 14, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 21 },
  diyEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#34D399', borderRadius: Radius.pill, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  diyEmptyBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },

  // Regular empty state
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
