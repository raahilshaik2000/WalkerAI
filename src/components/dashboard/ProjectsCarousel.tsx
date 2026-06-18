import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { isMissingSupabaseSchemaObjectError } from '@/lib/supabase/errors';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { useAuthStore } from '@/stores/auth.store';
import { AnimatedPressable, GlassButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { SectionHeader } from './SectionHeader';
import { ProgressRing } from './ProgressRing';
import { useStaggeredEntrance } from './useStaggeredEntrance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;
const CARD_GAP = 12;

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:       { label: 'Setting up',          color: '#6B7280' },
  brief_ready: { label: 'Ready to send',        color: '#F59E0B' },
  dispatching: { label: 'Finding contractor',  color: '#A78BFA' },
  quoting:     { label: 'Quote ready',          color: '#F59E0B' },
  accepted:    { label: 'Contractor reviewing', color: '#60A5FA' },
  scheduling:  { label: 'Schedule needed',      color: '#38BDF8' },
  active:      { label: 'In progress',          color: '#22C55E' },
  completed:   { label: 'Completed',            color: '#FF6B00' },
  diy_saved:   { label: 'DIY saved',            color: '#34D399' },
};

interface Project {
  id: string;
  room_type: string | null;
  status: string;
  address: string | null;
  city: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  renders: Array<{ url: string; selected?: boolean | null }>;
  project_photos: Array<{ url: string }>;
  gc_project_type?: string | null;
}

interface GcProjectContextRow {
  project_id: string;
  project_type: string | null;
}

function getProjectProgress(status: string) {
  if (status === 'completed') return 1;
  if (status === 'active') return 0.65;
  if (status === 'scheduling') return 0.45;
  if (status === 'accepted' || status === 'quoting') return 0.35;
  if (status === 'dispatching') return 0.2;
  if (status === 'brief_ready') return 0.18;
  return 0.1;
}

function getContractorStatus(status: string) {
  if (status === 'completed' || status === 'active' || status === 'scheduling') {
    return 'Contractor assigned';
  }
  if (status === 'quoting') {
    return 'Quote ready to review';
  }
  if (status === 'accepted') {
    return 'Contractor reviewing';
  }
  if (status === 'brief_ready') {
    return 'Ready to send again';
  }
  return 'Finding contractor';
}

export function ProjectsCarousel({ refreshKey = 0, onRefreshDone }: { refreshKey?: number; onRefreshDone?: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const animatedStyle = useStaggeredEntrance(3);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setProjects([]);
      setErrorMessage(null);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, room_type, status, address, city, ai_cost_min, ai_cost_max, renders(url, selected), project_photos(url)')
        .eq('homeowner_id', user.id)
        .not('status', 'eq', 'diy_saved')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        setProjects([]);
        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load projects.'));
        return;
      }
      let projectList = ((data as Project[]) ?? []).map((project) => ({
        ...project,
        room_type: project.room_type ?? null,
      }));
      const ids = projectList.map((project) => project.id);
      if (ids.length > 0) {
        const { data: gcContextData, error: gcContextError } = await supabase
          .from('general_contractor_projects')
          .select('project_id, project_type')
          .in('project_id', ids)
          .neq('status', 'removed')
          .order('created_at', { ascending: false });
        if (gcContextError) {
          if (!isMissingSupabaseSchemaObjectError(gcContextError, 'general_contractor_projects')) {
            setProjects([]);
            setErrorMessage(formatAppSafeErrorMessage(gcContextError, 'Could not load project management context.'));
            return;
          }
          setProjects(projectList);
          return;
        }

        const gcProjectTypes = new Map<string, string | null>();
        ((gcContextData ?? []) as GcProjectContextRow[]).forEach((row) => {
          if (!gcProjectTypes.has(row.project_id)) {
            gcProjectTypes.set(row.project_id, row.project_type);
          }
        });
        projectList = projectList.map((project) => ({
          ...project,
          gc_project_type: gcProjectTypes.get(project.id) ?? null,
        }));
      }
      setProjects(projectList);
    } finally {
      setLoading(false);
      onRefreshDone?.();
    }
  }, [user, onRefreshDone]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects, refreshKey]);

  const renderProject = useCallback(
    ({ item }: { item: Project }) => {
      const meta = STATUS_META[item.status] ?? { label: item.status, color: '#6B7280' };
      const selectedRender = item.renders?.find((render) => render.selected);
      const coverImage = selectedRender?.url ?? item.renders?.[0]?.url ?? item.project_photos?.[0]?.url;
      const title = formatGcProjectType(item.gc_project_type, item.room_type);
      const location = [item.address, item.city].filter(Boolean).join(', ') || 'Address pending';
      const budget = item.ai_cost_min && item.ai_cost_max
        ? `$${Math.round(item.ai_cost_min / 100).toLocaleString()}–$${Math.round(item.ai_cost_max / 100).toLocaleString()}`
        : 'TBD';
      const progress = getProjectProgress(item.status);

      return (
        <AnimatedPressable
          style={styles.card}
          haptic
          onPress={() => navigation.navigate('ProjectDetail', {
            screen: 'ProjectDetailMain',
            params: { id: item.id },
          })}
        >
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="home-outline" size={36} color="rgba(255,255,255,0.15)" />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.gradient}
          />

          <View style={[styles.badge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
            <View style={[styles.badgeDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.bodyTop}>
              <View style={styles.bodyLeft}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                <Text style={styles.address} numberOfLines={1}>{location}</Text>
              </View>
              <ProgressRing progress={progress} color={meta.color} size={44} />
            </View>

            <View style={styles.footer}>
              <View style={styles.contractorRow}>
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={12} color="rgba(255,255,255,0.5)" />
                </View>
                <Text style={styles.contractor} numberOfLines={1}>
                  {getContractorStatus(item.status)}
                </Text>
              </View>
              <Text style={styles.budget}>{budget}</Text>
            </View>
          </View>
        </AnimatedPressable>
      );
    },
    [navigation],
  );

  const renderEmpty = () => (
    <View style={styles.emptyCard}>
      <Ionicons name="home-outline" size={36} color={Colors.text.tertiary} />
      <Text style={styles.emptyTitle}>Your first renovation starts here</Text>
      <Text style={styles.emptySubtitle}>Create a project to get matched with top contractors</Text>
      <GlassButton
        label="Create Project"
        onPress={() => navigation.navigate('ProjectCreate')}
        variant="primary"
        size="sm"
        haptic
        style={styles.emptyButton}
      />
    </View>
  );

  const renderError = () => (
    <View style={styles.emptyCard}>
      <Ionicons name="alert-circle-outline" size={36} color={Colors.text.tertiary} />
      <Text style={styles.emptyTitle}>Projects could not load</Text>
      <Text style={styles.emptySubtitle}>{errorMessage}</Text>
      <GlassButton
        label="Try Again"
        onPress={loadProjects}
        variant="primary"
        size="sm"
        haptic
        style={styles.emptyButton}
      />
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader
        title="My Projects"
        onPress={() => navigation.navigate('Projects')}
      />
      {loading ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator color="rgba(255,255,255,0.3)" />
        </View>
      ) : errorMessage ? (
        renderError()
      ) : projects.length > 0 ? (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={renderProject}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          style={styles.listOuter}
          contentContainerStyle={styles.list}
        />
      ) : (
        renderEmpty()
      )}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  listOuter: { marginHorizontal: -16 },
  list: { gap: CARD_GAP, paddingHorizontal: 16 },
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  cover: { width: '100%', height: 140, resizeMode: 'cover' },
  coverPlaceholder: { backgroundColor: Colors.surface.default, alignItems: 'center', justifyContent: 'center' },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 70,
    height: 70,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  body: { padding: 14 },
  bodyTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bodyLeft: { flex: 1, marginRight: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 3 },
  address: { fontSize: 12, color: Colors.text.tertiary },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractor: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  budget: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderStyle: 'dashed',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.tertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyButton: { marginTop: 12, alignSelf: 'center' },
});
