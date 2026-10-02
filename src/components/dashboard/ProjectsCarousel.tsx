import React, { useCallback, useEffect } from 'react';
import {
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
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { useHomeownerCarouselProjects, type HomeownerCarouselProject } from '@/lib/homeowner-data';
import { useSilentFocusRefetch } from '@/lib/silent-focus-refetch';
import { useAuthStore } from '@/stores/auth.store';
import { AnimatedPressable, GlassButton, ListItemSkeleton } from '@/components/ui';
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
  quoting:     { label: 'Price ready',          color: '#F59E0B' },
  accepted:    { label: 'Contractor reviewing', color: '#60A5FA' },
  scheduling:  { label: 'Schedule needed',      color: '#38BDF8' },
  active:      { label: 'In progress',          color: '#22C55E' },
  completed:   { label: 'Completed',            color: '#FF6B00' },
  diy_saved:   { label: 'DIY saved',            color: '#34D399' },
};

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
    return 'Price ready to review';
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
  const projectsQuery = useHomeownerCarouselProjects(user?.id);
  useSilentFocusRefetch(projectsQuery.refetch);
  const projects = projectsQuery.data ?? [];
  const showSkeleton = !!user?.id && !projectsQuery.data && projectsQuery.isLoading;
  const errorMessage = projectsQuery.error
    ? formatAppSafeErrorMessage(projectsQuery.error, 'Could not load projects.')
    : null;

  useEffect(() => {
    if (refreshKey <= 0) return;
    let cancelled = false;
    void projectsQuery.refetch().finally(() => {
      if (!cancelled) onRefreshDone?.();
    });
    return () => { cancelled = true; };
    // Intentionally only re-run when parent bumps refreshKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const renderProject = useCallback(
    ({ item }: { item: HomeownerCarouselProject }) => {
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
        onPress={() => { void projectsQuery.refetch(); }}
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
      {showSkeleton ? (
        <View style={styles.emptyCard}>
          <ListItemSkeleton />
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
