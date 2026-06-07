import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { restartProjectDispatch } from '@/lib/project-dispatch';
import { buildProjectShareMessage } from '@/lib/project-share';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = SCREEN_HEIGHT * 0.38;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RealProject {
  id: string;
  room_type: string;
  status: string;
  description: string | null;
  address: string | null;
  city: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  created_at: string;
  renders: Array<{ url: string; selected?: boolean | null }>;
  project_photos: Array<{ url: string }>;
}

interface ProjectDetail {
  ai_analysis: any | null;
  questionnaire_answers: Record<string, string> | null;
  ai_confidence_score: number | null;
}

interface ScopeItem {
  phase: string;
  description: string;
  sort_order: number;
}

interface MaterialItem {
  item: string;
  quantity: number;
  unit: string;
  quality_tier: 'budget' | 'mid-range' | 'luxury';
}

interface PermitItem {
  permit_type: string;
  status: string;
}

function isMissingColumnError(message?: string | null) {
  return !!message && /column .* does not exist/i.test(message);
}

async function fetchProjectWithOptionalConfidence(projectId: string) {
  const withConfidence = await supabase
    .from('projects')
    .select('id, room_type, status, description, address, city, ai_cost_min, ai_cost_max, created_at, ai_analysis, questionnaire_answers, ai_confidence_score, renders(url, selected), project_photos(url)')
    .eq('id', projectId)
    .maybeSingle();

  if (!withConfidence.error) return withConfidence.data;
  if (!isMissingColumnError(withConfidence.error.message)) throw withConfidence.error;

  const withoutConfidence = await supabase
    .from('projects')
    .select('id, room_type, status, description, address, city, ai_cost_min, ai_cost_max, created_at, ai_analysis, questionnaire_answers, renders(url, selected), project_photos(url)')
    .eq('id', projectId)
    .maybeSingle();

  if (!withoutConfidence.error) {
    return withoutConfidence.data
      ? { ...withoutConfidence.data, ai_confidence_score: null }
      : null;
  }

  if (!isMissingColumnError(withoutConfidence.error.message)) throw withoutConfidence.error;

  const withoutConfidenceOrDescription = await supabase
    .from('projects')
    .select('id, room_type, status, address, city, ai_cost_min, ai_cost_max, created_at, ai_analysis, questionnaire_answers, renders(url, selected), project_photos(url)')
    .eq('id', projectId)
    .maybeSingle();

  if (withoutConfidenceOrDescription.error) throw withoutConfidenceOrDescription.error;
  return withoutConfidenceOrDescription.data
    ? { ...withoutConfidenceOrDescription.data, description: null, ai_confidence_score: null }
    : null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:       { label: 'Draft',       color: '#6B7280' },
  brief_ready: { label: 'Ready to Send', color: '#F59E0B' },
  dispatching: { label: 'Dispatching', color: '#A78BFA' },
  accepted:    { label: 'Accepted',    color: '#60A5FA' },
  quoting:     { label: 'Quoting',     color: '#F59E0B' },
  scheduling:  { label: 'Schedule Needed', color: '#38BDF8' },
  active:      { label: 'In Progress', color: '#22C55E' },
  completed:   { label: 'Completed',   color: '#FF6B00' },
  diy_saved:   { label: 'DIY Saved',    color: '#34D399' },
};

const TIER_COLOR: Record<string, string> = {
  budget: '#9CA3AF',
  'mid-range': '#60A5FA',
  luxury: '#FF6B00',
};

const PHASE_ICON: Record<string, string> = {
  demolition:   'hammer-outline',
  'rough-in':   'construct-outline',
  installation: 'build-outline',
  finishing:    'color-palette-outline',
};

const ACTIONS = [
  { screen: 'Milestones',   icon: 'flag-outline',               label: 'Milestones' },
  { screen: 'Messages',     icon: 'chatbubble-outline',          label: 'Messages'   },
  { screen: 'Quote',        icon: 'document-text-outline',       label: 'Quote'      },
  { screen: 'Permits',      icon: 'shield-checkmark-outline',    label: 'Permits'    },
  { screen: 'ChangeOrders', icon: 'swap-horizontal-outline',     label: 'Changes'    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function shortenAddress(addr: string | null, city: string | null): string {
  if (!addr) return city ?? 'Address not set';
  const parts = addr.split(',');
  return parts.slice(0, 2).join(',').trim();
}

function getOrderedPhotoUrls(project?: Partial<RealProject> | null) {
  const renders = project?.renders ?? [];
  const selectedUrl = renders.find((render) => render.selected)?.url;
  const urls = [
    selectedUrl,
    ...renders.map((render) => render.url),
    ...(project?.project_photos?.map((photo) => photo.url) ?? []),
  ].filter(Boolean) as string[];

  return [...new Set(urls)];
}

function getContractorCopy(status: string) {
  if (status === 'scheduling') {
    return {
      title: 'Contractors accepted your project',
      subtitle: 'Choose a start date to confirm the schedule',
    };
  }
  if (status === 'accepted') {
    return {
      title: 'Contractor accepted your project',
      subtitle: 'Review the next steps to activate the project',
    };
  }
  if (status === 'active') {
    return {
      title: 'Contractor assigned',
      subtitle: 'Your renovation is underway',
    };
  }
  if (status === 'completed') {
    return {
      title: 'Project completed',
      subtitle: 'Your renovation is complete',
    };
  }
  if (status === 'dispatching') {
    return {
      title: 'Finding your contractor',
      subtitle: 'Your project has been sent to nearby contractors',
    };
  }
  if (status === 'brief_ready') {
    return {
      title: 'Project brief ready',
      subtitle: 'No contractor accepted yet. Review your brief and send it again when ready',
    };
  }
  if (status === 'quoting') {
    return {
      title: 'Contractors are reviewing',
      subtitle: 'Contractors in your area are preparing quotes',
    };
  }
  return {
    title: 'Finding your contractor',
    subtitle: 'We are finding the best match for your project',
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProjectDetailViewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialProject = route.params?.project as Partial<RealProject> | undefined;
  const projectId = initialProject?.id;

  const [project, setProject]     = useState<RealProject | null>(
    initialProject?.status ? initialProject as RealProject : null
  );
  const [detail, setDetail]       = useState<ProjectDetail | null>(null);
  const [scope, setScope]         = useState<ScopeItem[]>([]);
  const [materials, setMats]      = useState<MaterialItem[]>([]);
  const [permits, setPermits]     = useState<PermitItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [redispatching, setRedispatching] = useState(false);

  const [photoUrls, setPhotoUrls] = useState<string[]>(getOrderedPhotoUrls(initialProject));

  const handleRetryDispatch = async () => {
    if (!project?.id) return;

    setRedispatching(true);
    try {
      const data = await restartProjectDispatch(project.id, 4, { regenerateSlotsFirst: true });
      if (!data?.success) {
        throw new Error(data?.message ?? 'No verified contractors matched this project yet.');
      }

      setProject((current) => current ? { ...current, status: 'dispatching' } : current);
      Alert.alert('Search restarted', 'We are notifying matching contractors in the wider service area now.');
    } catch (err) {
      Alert.alert('Could not restart search', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRedispatching(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }
      try {
        const [projectData, scopeRes, matsRes, permitsRes] = await Promise.all([
          fetchProjectWithOptionalConfidence(projectId),
          supabase
            .from('scope_of_work')
            .select('phase, description, sort_order')
            .eq('project_id', projectId)
            .order('sort_order'),
          supabase
            .from('materials')
            .select('item, quantity, unit, quality_tier')
            .eq('project_id', projectId),
          supabase
            .from('permits')
            .select('permit_type, status')
            .eq('project_id', projectId),
        ]);

        if (projectData) {
          setProject(projectData as RealProject);
          setDetail(projectData as ProjectDetail);
        }
        if (scopeRes.data) setScope(scopeRes.data as ScopeItem[]);
        if (matsRes.data)  setMats(matsRes.data as MaterialItem[]);
        if (permitsRes.data) setPermits(permitsRes.data as PermitItem[]);

        // Merge freshly-fetched photos with anything already in params
        const freshUrls = getOrderedPhotoUrls(projectData as Partial<RealProject> | null);
        if (freshUrls.length > 0) setPhotoUrls(freshUrls);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  if (!projectId) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.errorState}>
          <Ionicons name="warning-outline" size={42} color={Colors.warning} />
          <Text style={styles.errorTitle}>Project not found</Text>
          <Text style={styles.errorText}>This project link is missing an ID.</Text>
          <GlassButton label="Go back" onPress={() => navigation.goBack()} style={styles.errorButton} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!project && loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.errorState}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.errorTitle}>Loading project…</Text>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!project) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.errorState}>
          <Ionicons name="warning-outline" size={42} color={Colors.warning} />
          <Text style={styles.errorTitle}>Project not found</Text>
          <Text style={styles.errorText}>We could not load this project.</Text>
          <GlassButton label="Go back" onPress={() => navigation.goBack()} style={styles.errorButton} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const statusMeta = STATUS_META[project.status] ?? { label: project.status, color: '#6B7280' };
  const contractorCopy = getContractorCopy(project.status);
  const roomLabel  = project.room_type
    ? project.room_type.charAt(0).toUpperCase() + project.room_type.slice(1)
    : 'Home';
  const title = `${roomLabel} Renovation`;

  const handleShare = async () => {
    try {
      await Share.share({
        title,
        message: buildProjectShareMessage({
          title,
          statusLabel: statusMeta.label,
          address: project.address,
          city: project.city,
          costMinCents: project.ai_cost_min,
          costMaxCents: project.ai_cost_max,
        }),
      });
    } catch (err) {
      Alert.alert('Share failed', err instanceof Error ? err.message : 'Could not open the share sheet.');
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  };

  const analysis       = detail?.ai_analysis;
  const observations   = analysis?.ai_observations ?? null;
  const existingMats   = analysis?.existing_materials ?? null;
  const layoutInfo     = analysis?.layout ?? null;
  const confidence     = detail?.ai_confidence_score ?? null;

  return (
    <GradientBackground>
      <View style={styles.container}>

        {/* ── Hero ── */}
        <View style={styles.heroWrapper}>
          {photoUrls.length > 0 ? (
            <FlatList
              data={photoUrls}
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
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="home-outline" size={64} color="rgba(255,255,255,0.08)" />
            </View>
          )}

          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.88)']}
            style={styles.heroGradient}
            pointerEvents="none"
          />

          <SafeAreaView style={styles.topBar}>
            <AnimatedPressable style={styles.iconBtn} haptic onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable style={styles.iconBtn} haptic onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </AnimatedPressable>
          </SafeAreaView>

          <View style={styles.heroBottom}>
            <View style={[styles.statusBadge, {
              backgroundColor: statusMeta.color + '25',
              borderColor: statusMeta.color + '60',
            }]}>
              <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
              <Text style={[styles.statusText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{title}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.55)" />
              <Text style={styles.heroAddress} numberOfLines={1}>
                {shortenAddress(project.address, project.city)}
              </Text>
            </View>
          </View>

          {photoUrls.length > 1 && (
            <View style={styles.dots}>
              {photoUrls.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIdx && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* ── Body ── */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >

          {/* Cost + Confidence */}
          {(project.ai_cost_min || project.ai_cost_max) ? (
            <GlassCard style={styles.section}>
              <View style={styles.costRow}>
                <View style={styles.flex}>
                  <Text style={styles.sectionLabel}>ESTIMATED COST</Text>
                  <Text style={styles.costRange}>
                    {project.ai_cost_min ? formatCad(project.ai_cost_min) : '—'}
                    {' – '}
                    {project.ai_cost_max ? formatCad(project.ai_cost_max) : '—'}
                  </Text>
                  <Text style={styles.costNote}>Walker AI fixed price · confirmed by your contractor</Text>
                </View>
                {confidence != null && (
                  <View style={[
                    styles.confBadge,
                    confidence >= 80 ? styles.confHigh
                    : confidence >= 60 ? styles.confMid
                    : styles.confLow,
                  ]}>
                    <Text style={styles.confScore}>{confidence}%</Text>
                    <Text style={styles.confLabel}>confidence</Text>
                  </View>
                )}
              </View>
            </GlassCard>
          ) : null}

          {/* Quote review is the authoritative payment path. */}
          {project.status === 'accepted' && project.ai_cost_min && project.ai_cost_max && (
            <GlassCard style={[styles.section, styles.acceptedPaymentCard]}>
              <Text style={styles.sectionLabel}>CONTRACTOR ACCEPTED</Text>
              <Text style={styles.paymentTitle}>
                Your contractor is ready for the next step. Review the submitted quote before funding any work.
              </Text>
              <Text style={styles.paymentSub}>
                WalkerAI only charges the actual contractor quote. Funds are held in escrow and released milestone by milestone.
              </Text>
              <GlassButton
                label="Review Contractor Quote"
                onPress={() => navigation.navigate('ProjectDetail', { screen: 'Quote', params: { id: project.id } })}
                fullWidth
                size="lg"
                haptic
              />
            </GlassCard>
          )}

          {/* Contractor status */}
          <GlassCard style={styles.section}>
            <View style={styles.contractorRow}>
              <View style={styles.pulseCircle}>
                <Ionicons name="person-outline" size={22} color={Colors.text.tertiary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.contractorTitle}>
                  {contractorCopy.title}
                </Text>
                <Text style={styles.contractorSub}>
                  {contractorCopy.subtitle}
                </Text>
              </View>
            </View>
            {project.status === 'brief_ready' && (
              <View style={styles.retryDispatch}>
                <GlassButton
                  label={redispatching ? 'Restarting search...' : 'Restart Contractor Search'}
                  onPress={handleRetryDispatch}
                  loading={redispatching}
                  fullWidth
                  haptic
                />
                <Text style={styles.retryDispatchNote}>
                  We will search the widest service area and only notify matching companies.
                </Text>
              </View>
            )}
          </GlassCard>

          {/* Loading spinner while fetching detail */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.loadingText}>Loading project details…</Text>
            </View>
          )}

          {/* AI Observations */}
          {observations && (
            <GlassCard style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="sparkles" size={14} color="#FF6B00" />
                <Text style={styles.sectionTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.observationsText}>{observations}</Text>

              {/* Detected conditions grid */}
              {existingMats && (
                <View style={styles.conditionsGrid}>
                  {existingMats.cabinets?.type ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Cabinets</Text>
                      <Text style={styles.conditionVal}>{existingMats.cabinets.type}</Text>
                      {existingMats.cabinets.condition ? (
                        <Text style={styles.conditionSub}>{existingMats.cabinets.condition}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {existingMats.countertops?.material ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Countertops</Text>
                      <Text style={styles.conditionVal}>{existingMats.countertops.material}</Text>
                    </View>
                  ) : null}
                  {existingMats.flooring?.material ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Flooring</Text>
                      <Text style={styles.conditionVal}>{existingMats.flooring.material}</Text>
                    </View>
                  ) : null}
                  {layoutInfo?.estimated_sqft > 0 ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Est. Size</Text>
                      <Text style={styles.conditionVal}>{layoutInfo.estimated_sqft} sqft</Text>
                    </View>
                  ) : null}
                  {layoutInfo?.window_count > 0 ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Windows</Text>
                      <Text style={styles.conditionVal}>{layoutInfo.window_count}</Text>
                    </View>
                  ) : null}
                  {layoutInfo?.has_island ? (
                    <View style={styles.conditionChip}>
                      <Text style={styles.conditionKey}>Island</Text>
                      <Text style={styles.conditionVal}>Yes</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Structural concerns */}
              {analysis?.structural_concerns?.length > 0 && (
                <View style={styles.concernsBox}>
                  <View style={styles.concernsHeader}>
                    <Ionicons name="warning-outline" size={13} color="#F59E0B" />
                    <Text style={styles.concernsTitle}>Structural Concerns</Text>
                  </View>
                  {analysis.structural_concerns.map((c: string, i: number) => (
                    <Text key={i} style={styles.concernItem}>· {c}</Text>
                  ))}
                </View>
              )}
            </GlassCard>
          )}

          {/* Scope of Work */}
          {scope.length > 0 && (
            <GlassCard style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="list-outline" size={14} color="#FF6B00" />
                <Text style={styles.sectionTitle}>Scope of Work</Text>
              </View>
              {scope.map((item, i) => (
                <View key={i} style={[styles.scopeRow, i < scope.length - 1 && styles.scopeDivider]}>
                  <View style={styles.scopeIcon}>
                    <Ionicons
                      name={(PHASE_ICON[item.phase.toLowerCase()] ?? 'ellipse-outline') as any}
                      size={15}
                      color="#FF6B00"
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.scopePhase}>
                      {item.phase.charAt(0).toUpperCase() + item.phase.slice(1)}
                    </Text>
                    <Text style={styles.scopeDesc}>{item.description}</Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <GlassCard style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="layers-outline" size={14} color="#FF6B00" />
                <Text style={styles.sectionTitle}>Materials</Text>
                <Text style={styles.sectionCount}>{materials.length} items</Text>
              </View>
              {materials.map((mat, i) => (
                <View key={i} style={[styles.matRow, i < materials.length - 1 && styles.matDivider]}>
                  <Text style={styles.matName} numberOfLines={1}>{mat.item}</Text>
                  <View style={styles.matRight}>
                    <Text style={styles.matQty}>{mat.quantity} {mat.unit}</Text>
                    <View style={[styles.tierPill, {
                      borderColor: TIER_COLOR[mat.quality_tier] + '55',
                      backgroundColor: TIER_COLOR[mat.quality_tier] + '18',
                    }]}>
                      <Text style={[styles.tierText, { color: TIER_COLOR[mat.quality_tier] }]}>
                        {mat.quality_tier}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Permits */}
          {permits.length > 0 && (
            <GlassCard style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="document-text-outline" size={14} color="#FF6B00" />
                <Text style={styles.sectionTitle}>Permits</Text>
              </View>
              {permits.map((p, i) => (
                <View key={i} style={[styles.permitRow, i < permits.length - 1 && styles.matDivider]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={Colors.accent} />
                  <Text style={styles.permitType}>{p.permit_type}</Text>
                  <View style={styles.permitStatusBadge}>
                    <Text style={styles.permitStatusText}>
                      {p.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Project Actions */}
          <Text style={styles.actionsHeading}>Project Actions</Text>
          <View style={styles.actionsGrid}>
            {[
              ...ACTIONS,
              ...(project.status === 'completed'
                ? [{ screen: 'Review', icon: 'star-outline', label: 'Review' }]
                : []),
            ].map((action) => (
              <AnimatedPressable
                key={action.screen}
                style={styles.actionItem}
                haptic
                onPress={() => navigation.navigate('ProjectDetail', { screen: action.screen, params: { id: project.id } })}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name={action.icon as any} size={22} color="#fff" />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Project Info */}
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="information-circle-outline" size={14} color="#FF6B00" />
              <Text style={styles.sectionTitle}>Project Info</Text>
            </View>
            <InfoRow label="Room type" value={roomLabel} />
            <View style={styles.infoDivider} />
            <InfoRow label="Status" value={statusMeta.label} valueStyle={{ color: statusMeta.color }} />
            <View style={styles.infoDivider} />
            <InfoRow label="Address" value={project.address ?? 'Not set'} multiline />
            <View style={styles.infoDivider} />
            <InfoRow label="Created" value={formatDate(project.created_at)} />
          </GlassCard>

        </ScrollView>
      </View>
    </GradientBackground>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function InfoRow({ label, value, multiline, valueStyle }: {
  label: string;
  value: string;
  multiline?: boolean;
  valueStyle?: object;
}) {
  return (
    <View style={[infoRowStyles.row, multiline && infoRowStyles.alignTop]}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, multiline && infoRowStyles.multilineValue, valueStyle]}
        numberOfLines={multiline ? 3 : 1}>
        {value}
      </Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  alignTop: { alignItems: 'flex-start' },
  label: { fontSize: 13, color: Colors.text.tertiary, flex: 0.45 },
  value: { fontSize: 13, fontWeight: '600', color: '#fff', flex: 0.55, textAlign: 'right' },
  multilineValue: { textAlign: 'right' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginTop: 16, textAlign: 'center' },
  errorText: { fontSize: 14, color: Colors.text.secondary, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  errorButton: { marginTop: 20 },

  // Hero
  heroWrapper: { height: HERO_HEIGHT, width: SCREEN_WIDTH },
  heroImage: { width: SCREEN_WIDTH, height: HERO_HEIGHT, resizeMode: 'cover' },
  heroPlaceholder: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBottom: { position: 'absolute', bottom: 44, left: 16, right: 16 },
  statusBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, marginBottom: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.4, marginBottom: 6 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroAddress: { fontSize: 13, color: 'rgba(255,255,255,0.65)', flex: 1 },
  dots: { position: 'absolute', bottom: 26, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#fff', width: 18 },

  // Body
  body: {
    flex: 1, marginTop: -20,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    backgroundColor: Colors.bg.primary,
  },
  bodyContent: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 120 },

  section: { marginBottom: 12 },
  acceptedPaymentCard: { borderColor: 'rgba(255,107,0,0.4)' },
  paymentTitle: { color: Colors.text.primary, fontSize: 15, marginBottom: 4 },
  paymentSub: { color: Colors.text.secondary, fontSize: 13, marginBottom: 16 },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontSize: 13, color: Colors.text.tertiary },

  // Cost card
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.text.tertiary, letterSpacing: 0.8, marginBottom: 4 },
  costRange: { fontSize: 26, fontWeight: '800', color: '#34D399', letterSpacing: -0.5, marginBottom: 4 },
  costNote: { fontSize: 11, color: Colors.text.tertiary },
  confBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 70, borderWidth: 1 },
  confHigh: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.3)' },
  confMid:  { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)' },
  confLow:  { backgroundColor: 'rgba(239,68,68,0.12)',  borderColor: 'rgba(239,68,68,0.3)'  },
  confScore: { fontSize: 20, fontWeight: '800', color: '#fff' },
  confLabel: { fontSize: 9, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Contractor card
  contractorRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pulseCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  contractorTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  contractorSub: { fontSize: 12, color: Colors.text.tertiary, lineHeight: 18 },
  retryDispatch: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  retryDispatchNote: { fontSize: 11, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 16, marginTop: 10 },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  sectionCount: { fontSize: 11, color: Colors.text.tertiary },

  // Observations
  observationsText: { fontSize: 14, color: Colors.text.secondary, lineHeight: 22, marginBottom: 14 },
  conditionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  conditionChip: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  conditionKey: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  conditionVal: { fontSize: 13, fontWeight: '600', color: '#fff' },
  conditionSub: { fontSize: 11, color: Colors.text.tertiary, marginTop: 1 },

  // Structural concerns
  concernsBox: {
    marginTop: 12, backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 12,
  },
  concernsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  concernsTitle: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  concernItem: { fontSize: 12, color: '#F59E0B', lineHeight: 20, opacity: 0.9 },

  // Scope
  scopeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  scopeDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  scopeIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,107,0,0.1)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  scopePhase: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 3, textTransform: 'capitalize' },
  scopeDesc: { fontSize: 12, color: Colors.text.secondary, lineHeight: 18 },

  // Materials
  matRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  matDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  matName: { fontSize: 13, color: '#fff', fontWeight: '500', flex: 1, marginRight: 8 },
  matRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matQty: { fontSize: 12, color: Colors.text.tertiary },
  tierPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tierText: { fontSize: 11, fontWeight: '600' },

  // Permits
  permitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  permitType: { fontSize: 13, color: '#fff', flex: 1 },
  permitStatusBadge: {
    backgroundColor: 'rgba(255,107,0,0.1)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  permitStatusText: { fontSize: 11, fontWeight: '600', color: Colors.accent, textTransform: 'capitalize' },

  // Actions
  actionsHeading: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  actionItem: {
    width: (SCREEN_WIDTH - 32 - 20) / 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', paddingVertical: 18, gap: 8,
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,107,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.text.secondary },

  // Info rows
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
});
