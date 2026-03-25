import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DashboardProject } from '@/components/dashboard/data';
import { ProgressRing } from '@/components/dashboard/ProgressRing';
import { MILESTONES } from '@/components/dashboard/projectDetailData';
import { CHAT_THREADS } from '@/components/dashboard/messageData';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.42;

const ACTIONS = [
  { key: 'DetailMilestones', icon: 'flag-outline', label: 'Milestones' },
  { key: 'DetailMessages', icon: 'chatbubble-outline', label: 'Messages' },
  { key: 'DetailQuote', icon: 'document-text-outline', label: 'Quote' },
  { key: 'DetailPermits', icon: 'shield-checkmark-outline', label: 'Permits' },
  { key: 'DetailChangeOrders', icon: 'swap-horizontal-outline', label: 'Changes' },
  { key: 'DetailReview', icon: 'star-outline', label: 'Review' },
];

export default function ProjectDetailViewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const project: DashboardProject = route.params?.project;
  const milestones = MILESTONES[project.id] ?? [];
  const [activeIndex, setActiveIndex] = useState(0);

  const images = project.images?.length ? project.images : [project.coverImage];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  };

  return (
    <GradientBackground>
      <View style={styles.container}>
        {/* Hero image carousel */}
        <View style={styles.heroWrapper}>
          <FlatList
            data={images}
            keyExtractor={(_, i) => `img-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item: uri }) => (
              <Image source={{ uri }} style={styles.heroImage} />
            )}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.85)']}
            style={styles.heroGradient}
            pointerEvents="none"
          />

          {/* Top bar */}
          <SafeAreaView style={styles.topBar}>
            <AnimatedPressable style={styles.iconBtn} haptic onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable style={styles.iconBtn} haptic onPress={() => {}}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </AnimatedPressable>
          </SafeAreaView>

          {/* Hero bottom content */}
          <View style={styles.heroBottom}>
            <View style={[styles.statusBadge, { backgroundColor: project.statusColor + '22', borderColor: project.statusColor + '55' }]}>
              <View style={[styles.statusDot, { backgroundColor: project.statusColor }]} />
              <Text style={[styles.statusText, { color: project.statusColor }]}>{project.statusLabel}</Text>
            </View>
            <Text style={styles.heroTitle}>{project.title}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.6)" />
              <Text style={styles.heroAddress}>{project.address}</Text>
            </View>
          </View>

          {/* Page dots */}
          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress card */}
          <GlassCard style={styles.progressCard}>
            <View style={styles.progressRow}>
              <ProgressRing progress={project.progress} size={64} strokeWidth={4} color={project.statusColor} />
              <View style={styles.progressInfo}>
                <Text style={styles.progressLabel}>Project Progress</Text>
                <Text style={styles.progressSub}>
                  {project.milestonesCompleted} of {project.milestonesTotal} milestones completed
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="cash-outline" size={13} color={Colors.text.tertiary} />
                    <Text style={styles.metaText}>{project.budget}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.text.tertiary} />
                    <Text style={styles.metaText}>{project.dueDate}</Text>
                  </View>
                </View>
              </View>
            </View>
          </GlassCard>

          {/* Contractor card */}
          <GlassCard style={styles.contractorCard}>
            {project.contractorAvatar ? (
              <View style={styles.contractorRow}>
                <Image source={{ uri: project.contractorAvatar }} style={styles.contractorAvatar} />
                <View style={styles.contractorInfo}>
                  <View style={styles.contractorNameRow}>
                    <Text style={styles.contractorName}>{project.contractor}</Text>
                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                  </View>
                  <Text style={styles.contractorSub}>Assigned Contractor</Text>
                </View>
                <AnimatedPressable
                  style={styles.messageBtn}
                  haptic
                  onPress={() => {
                    const thread = CHAT_THREADS.find((t) => t.projectId === project.id);
                    if (thread) navigation.navigate('Chat', { thread });
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.noContractor}>
                <View style={styles.pulseCircle}>
                  <Ionicons name="person-outline" size={20} color={Colors.text.tertiary} />
                </View>
                <View>
                  <Text style={styles.noContractorTitle}>
                    {project.status === 'quoting' ? 'Reviewing bids' : 'Awaiting contractor match'}
                  </Text>
                  <Text style={styles.noContractorSub}>{project.contractor}</Text>
                </View>
              </View>
            )}
          </GlassCard>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Project Actions</Text>
          <View style={styles.actionsGrid}>
            {ACTIONS.map((action) => (
              <AnimatedPressable
                key={action.key}
                style={styles.actionItem}
                haptic
                onPress={() => {
                  if (action.key === 'DetailMessages') {
                    const thread = CHAT_THREADS.find((t) => t.projectId === project.id);
                    if (thread) navigation.navigate('Chat', { thread });
                  } else {
                    navigation.navigate(action.key, { projectId: project.id });
                  }
                }}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon as any} size={20} color="#fff" />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Milestones preview */}
          {milestones.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Milestones</Text>
              <GlassCard padding={0}>
                {milestones.slice(0, 4).map((m, i) => (
                  <View key={m.id}>
                    <View style={styles.milestoneRow}>
                      <View style={[styles.milestoneDot, { backgroundColor: m.statusColor }]} />
                      <View style={styles.milestoneText}>
                        <Text style={styles.milestoneTitle}>{m.title}</Text>
                        <Text style={styles.milestoneMeta}>
                          ${m.amount.toLocaleString()} · {m.dueDate}
                        </Text>
                      </View>
                    </View>
                    {i < Math.min(milestones.length, 4) - 1 && <View style={styles.divider} />}
                  </View>
                ))}
                {milestones.length > 4 && (
                  <AnimatedPressable
                    style={styles.viewAllRow}
                    haptic
                    onPress={() => navigation.navigate('DetailMilestones', { projectId: project.id })}
                  >
                    <Text style={styles.viewAllText}>View all milestones</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                  </AnimatedPressable>
                )}
              </GlassCard>
            </>
          )}

          {/* Project Info */}
          <Text style={styles.sectionTitle}>Project Info</Text>
          <GlassCard>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Room Type</Text>
              <Text style={styles.infoValue}>
                {project.roomType === 'kitchen' ? 'Kitchen' : 'Bathroom'}
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{project.address}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Budget</Text>
              <Text style={styles.infoValue}>{project.budget}</Text>
            </View>
          </GlassCard>
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero carousel
  heroWrapper: { height: HERO_HEIGHT, width: SCREEN_WIDTH },
  heroImage: { width: SCREEN_WIDTH, height: HERO_HEIGHT, resizeMode: 'cover' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBottom: {
    position: 'absolute', bottom: 44, left: 16, right: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, marginBottom: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  heroTitle: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.3, marginBottom: 6 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroAddress: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  // Page dots
  dotsContainer: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },

  // Body
  body: { flex: 1, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: Colors.bg.primary },
  bodyContent: { padding: 16, paddingTop: 28, paddingBottom: 120 },

  progressCard: { marginBottom: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressInfo: { flex: 1 },
  progressLabel: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 3 },
  progressSub: { fontSize: 12, color: Colors.text.secondary, marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },

  contractorCard: { marginBottom: Spacing.md },
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contractorAvatar: { width: 44, height: 44, borderRadius: 22 },
  contractorInfo: { flex: 1 },
  contractorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contractorName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  contractorSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  messageBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center',
  },
  noContractor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pulseCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center',
  },
  noContractorTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  noContractorSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12, marginTop: 8 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  actionItem: {
    width: (SCREEN_WIDTH - 32 - 20) / 3,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    alignItems: 'center', paddingVertical: 16, gap: 8,
  },
  actionIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.text.secondary },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  milestoneDot: { width: 10, height: 10, borderRadius: 5 },
  milestoneText: { flex: 1 },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  milestoneMeta: { fontSize: 12, color: Colors.text.tertiary },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 36 },
  viewAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  viewAllText: { fontSize: 13, fontWeight: '600', color: Colors.accent },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 13, color: Colors.text.tertiary },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#fff' },
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 10 },
});
