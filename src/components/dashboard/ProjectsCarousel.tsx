import React, { useCallback } from 'react';
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
import { AnimatedPressable, GlassButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DashboardProject, FAKE_PROJECTS } from './data';
import { SectionHeader } from './SectionHeader';
import { ProgressRing } from './ProgressRing';
import { useStaggeredEntrance } from './useStaggeredEntrance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 64;
const CARD_GAP = 12;

export function ProjectsCarousel() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(3);

  const renderProject = useCallback(
    ({ item }: { item: DashboardProject }) => (
      <AnimatedPressable
        style={styles.card}
        haptic
        onPress={() => navigation.navigate('ProjectDetailView', { project: item })}
      >
        <Image source={{ uri: item.coverImage }} style={styles.cover} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.gradient}
        />

        {/* Status badge */}
        <View style={[styles.badge, { backgroundColor: item.statusColor + '22', borderColor: item.statusColor + '55' }]}>
          <View style={[styles.badgeDot, { backgroundColor: item.statusColor }]} />
          <Text style={[styles.badgeText, { color: item.statusColor }]}>{item.statusLabel}</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.bodyTop}>
            <View style={styles.bodyLeft}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
            </View>
            <ProgressRing progress={item.progress} color={item.statusColor} size={44} />
          </View>

          <View style={styles.footer}>
            <View style={styles.contractorRow}>
              {item.contractorAvatar ? (
                <Image source={{ uri: item.contractorAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={12} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              <Text style={styles.contractor} numberOfLines={1}>{item.contractor}</Text>
            </View>
            <Text style={styles.budget}>{item.budget}</Text>
          </View>
        </View>
      </AnimatedPressable>
    ),
    [],
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
        style={{ marginTop: 12 }}
      />
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader
        title="My Projects"
        onPress={() => navigation.navigate('Projects')}
      />
      {FAKE_PROJECTS.length > 0 ? (
        <FlatList
          data={FAKE_PROJECTS}
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

  // Empty state
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
});
