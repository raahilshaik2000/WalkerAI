import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

const DIMENSIONS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'quality_rating', label: 'Work Quality', icon: '🔨' },
  { key: 'communication_rating', label: 'Communication', icon: '💬' },
  { key: 'timeliness_rating', label: 'On-Time Delivery', icon: '⏱️' },
  { key: 'cleanliness_rating', label: 'Cleanliness', icon: '🧹' },
];

interface ReviewTarget {
  target_id: string;
  target_type: 'company' | 'general_contractor';
  user_id: string;
  name: string;
  trade_type?: string | null;
}

function normalizeCompany(company: any): { id: string; user_id: string; name: string } | null {
  const row = Array.isArray(company) ? company[0] : company;
  if (!row?.id || !row?.user_id) return null;
  return { id: row.id, user_id: row.user_id, name: row.name ?? 'Contractor' };
}

function normalizeGeneralContractor(gc: any): { id: string; user_id: string; name: string } | null {
  const row = Array.isArray(gc) ? gc[0] : gc;
  if (!row?.id || !row?.user_id) return null;
  return { id: row.id, user_id: row.user_id, name: row.business_name ?? 'General Contractor' };
}

function reviewTargetKey(target: Pick<ReviewTarget, 'target_type' | 'target_id'>) {
  return `${target.target_type}:${target.target_id}`;
}

function isMissingRatingRpcError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
  return /update_company_rating/i.test(text) && /not find|does not exist|schema cache|function|argument/i.test(text);
}

function isLegacyProjectReviewUniqueError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
  return error?.code === '23505' && /reviews_project_id_reviewer_id_key|project_id.*reviewer_id/i.test(text);
}

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.star, n <= value && styles.starFilled]}>{n <= value ? '★' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [ratings, setRatings] = useState<Record<string, number>>({
    quality_rating: 0,
    communication_rating: 0,
    timeliness_rating: 0,
    cleanliness_rating: 0,
  });
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [targets, setTargets] = useState<ReviewTarget[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);

  const selectedTarget = targets.find((target) => reviewTargetKey(target) === selectedTargetKey) ?? targets[0] ?? null;

  const overallRating = Math.round(
    Object.values(ratings).reduce((s, v) => s + v, 0) / DIMENSIONS.length
  );

  const loadReviewTargets = useCallback(async () => {
    if (!projectId) {
      setLoadingTargets(false);
      return;
    }

    setLoadingTargets(true);
    setTargetError(null);
    try {
      const [quotesRes, slotsRes, legacyRes, gcRes] = await Promise.all([
        supabase
          .from('quotes')
          .select('company_id, companies(id, user_id, name)')
          .eq('project_id', projectId)
          .eq('status', 'approved'),
        supabase
          .from('project_slots')
          .select('trade_type, assigned_company_id, companies(id, user_id, name)')
          .eq('project_id', projectId)
          .not('assigned_company_id', 'is', null),
        supabase
          .from('projects')
          .select('assigned_company_id, status, companies:assigned_company_id(id, user_id, name)')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('general_contractor_projects')
          .select('general_contractor_id, project_type, general_contractor:general_contractors(id, user_id, business_name)')
          .eq('project_id', projectId)
          .in('status', ['active', 'completed']),
      ]);

      const loadError = quotesRes.error ?? slotsRes.error ?? legacyRes.error ?? gcRes.error;
      if (loadError) {
        setTargets([]);
        setSelectedTargetKey(null);
        setProjectStatus((legacyRes.data as any)?.status ?? null);
        setTargetError(loadError.message);
        return;
      }

      setProjectStatus((legacyRes.data as any)?.status ?? null);

      const byCompany = new Map<string, ReviewTarget>();
      for (const quote of quotesRes.data ?? []) {
        const company = normalizeCompany((quote as any).companies);
        if (!company) continue;
        byCompany.set(company.id, {
          target_id: company.id,
          target_type: 'company',
          user_id: company.user_id,
          name: company.name,
          trade_type: null,
        });
      }
      for (const slot of slotsRes.data ?? []) {
        const company = normalizeCompany((slot as any).companies);
        if (!company) continue;
        byCompany.set(company.id, {
          target_id: company.id,
          target_type: 'company',
          user_id: company.user_id,
          name: company.name,
          trade_type: (slot as any).trade_type ?? null,
        });
      }
      const legacyCompany = normalizeCompany((legacyRes.data as any)?.companies);
      if (legacyCompany) {
        byCompany.set(legacyCompany.id, {
          target_id: legacyCompany.id,
          target_type: 'company',
          user_id: legacyCompany.user_id,
          name: legacyCompany.name,
          trade_type: null,
        });
      }

      const gcTargets: ReviewTarget[] = [];
      for (const assignment of gcRes.data ?? []) {
        const gc = normalizeGeneralContractor((assignment as any).general_contractor);
        if (!gc) continue;
        gcTargets.push({
          target_id: gc.id,
          target_type: 'general_contractor',
          user_id: gc.user_id,
          name: gc.name,
          trade_type: (assignment as any).project_type ? `GC management · ${(assignment as any).project_type}` : 'GC management',
        });
      }

      const nextTargets = [...gcTargets, ...Array.from(byCompany.values())];
      setTargets(nextTargets);
      setSelectedTargetKey((prev) => (
        prev && nextTargets.some((target) => reviewTargetKey(target) === prev)
          ? prev
          : nextTargets[0] ? reviewTargetKey(nextTargets[0]) : null
      ));
    } finally {
      setLoadingTargets(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadReviewTargets();
  }, [loadReviewTargets]);

  const handleSubmit = async () => {
    const unrated = DIMENSIONS.filter((d) => !ratings[d.key]);
    if (unrated.length > 0) {
      Alert.alert('Rate all categories', `Please rate: ${unrated.map((d) => d.label).join(', ')}`);
      return;
    }

    if (!selectedTarget) {
      Alert.alert(
        'No contractor found',
        targetError
          ? `WalkerAI could not load contractor review targets: ${targetError}`
          : 'There is no assigned contractor available to review yet.'
      );
      return;
    }

    if (projectStatus !== 'completed') {
      Alert.alert('Project not complete', 'You can leave a contractor review after the project is completed.');
      return;
    }

    setSubmitting(true);
    try {
      // Duplicate guard
      const { data: existing, error: existingError } = await supabase
        .from('reviews')
        .select('id')
        .eq('project_id', projectId)
        .eq('reviewer_id', user!.id)
        .eq('reviewee_id', selectedTarget.user_id)
        .maybeSingle();
      if (existingError) {
        throw new Error(`Could not check existing reviews: ${existingError.message}`);
      }

      if (existing) {
        Alert.alert('Already reviewed', `You have already reviewed ${selectedTarget.name}.`);
        return;
      }

      const { error: insertError } = await supabase.from('reviews').insert({
        project_id: projectId,
        reviewer_id: user!.id,
        reviewee_id: selectedTarget.user_id,
        rating: overallRating,
        quality_rating: ratings.quality_rating,
        communication_rating: ratings.communication_rating,
        timeliness_rating: ratings.timeliness_rating,
        cleanliness_rating: ratings.cleanliness_rating,
        comment: comment.trim() || null,
      });
      if (isLegacyProjectReviewUniqueError(insertError)) {
        Alert.alert(
          'Project already reviewed',
          'This environment currently allows one review per project. The multi-trade review migration must be applied before you can review each contractor separately.'
        );
        return;
      }
      if (insertError) throw insertError;

      // Newer schemas expose a callable refresh RPC. Older live schemas use an
      // INSERT trigger instead, so this refresh must not make a saved review
      // look like a failed submission.
      if (selectedTarget.target_type === 'company') {
        const { error: ratingError } = await supabase.rpc('update_company_rating', {
          p_company_id: selectedTarget.target_id,
        });
        if (ratingError && !isMissingRatingRpcError(ratingError)) {
          console.warn('Review saved but company rating refresh failed:', ratingError);
        }
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      Alert.alert(
        'Review submitted!',
        'Thank you for your feedback.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Leave a Review</Text>
            <View style={{ width: 48 }} />
          </View>

          <Text style={styles.subtitle}>
            How did your contractor do? Rate each area of the renovation.
          </Text>

          {projectStatus && projectStatus !== 'completed' ? (
            <GlassCard style={styles.dimCard}>
              <Text style={styles.sectionLabel}>Reviews unlock after project completion.</Text>
              <Text style={styles.lockedCopy}>
                Finish the work, approve final milestones, and return here during closeout.
              </Text>
            </GlassCard>
          ) : null}

          {loadingTargets ? (
            <GlassCard style={styles.dimCard}>
              <Text style={styles.sectionLabel}>Loading contractors…</Text>
            </GlassCard>
          ) : targetError ? (
            <GlassCard style={[styles.dimCard, styles.errorCard]}>
              <Text style={styles.sectionLabel}>Could not load contractors</Text>
              <Text style={styles.errorCopy}>{targetError}</Text>
              <GlassButton
                label="Try Again"
                onPress={loadReviewTargets}
                size="sm"
                style={styles.retryButton}
              />
            </GlassCard>
          ) : targets.length > 1 ? (
            <GlassCard style={styles.dimCard}>
              <Text style={styles.sectionLabel}>Who are you reviewing?</Text>
              <View style={styles.targetList}>
                {targets.map((target) => (
                  <TouchableOpacity
                    key={reviewTargetKey(target)}
                    style={[
                      styles.targetPill,
                      selectedTarget && reviewTargetKey(selectedTarget) === reviewTargetKey(target) && styles.targetPillActive,
                    ]}
                    onPress={() => setSelectedTargetKey(reviewTargetKey(target))}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.targetName,
                      selectedTarget && reviewTargetKey(selectedTarget) === reviewTargetKey(target) && styles.targetNameActive,
                    ]}>
                      {target.name}
                    </Text>
                    {target.trade_type ? (
                      <Text style={styles.targetTrade}>{target.trade_type.replace(/_/g, ' ')}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </GlassCard>
          ) : targets.length === 1 ? (
            <GlassCard style={styles.dimCard}>
              <Text style={styles.sectionLabel}>Reviewing</Text>
              <Text style={styles.reviewingName}>{selectedTarget?.name}</Text>
              {selectedTarget?.trade_type ? (
                <Text style={styles.targetTrade}>{selectedTarget.trade_type.replace(/_/g, ' ')}</Text>
              ) : null}
            </GlassCard>
          ) : (
            <GlassCard style={styles.dimCard}>
              <Text style={styles.sectionLabel}>No contractor available to review yet.</Text>
            </GlassCard>
          )}

          {/* Overall preview */}
          <GlassCard style={styles.overallCard}>
            <Text style={styles.overallStars}>{'★'.repeat(overallRating)}{'☆'.repeat(5 - overallRating)}</Text>
            <Text style={styles.overallLabel}>Overall rating</Text>
          </GlassCard>

          {/* Dimension ratings */}
          {DIMENSIONS.map((dim) => (
            <GlassCard key={dim.key} style={styles.dimCard}>
              <View style={styles.dimRow}>
                <Text style={styles.dimIcon}>{dim.icon}</Text>
                <Text style={styles.dimLabel}>{dim.label}</Text>
              </View>
              <StarRow
                value={ratings[dim.key]}
                onChange={(n) => setRatings((prev) => ({ ...prev, [dim.key]: n }))}
              />
            </GlassCard>
          ))}

          {/* Comment */}
          <GlassCard style={styles.commentCard}>
            <Text style={styles.sectionLabel}>Comments (optional)</Text>
            <TextInput
              style={[styles.commentInput, { color: Colors.text.primary }]}
              value={comment}
              onChangeText={setComment}
              placeholder="Describe your experience..."
              placeholderTextColor={Colors.text.secondary}
              multiline
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{comment.length}/1000</Text>
          </GlassCard>

          <GlassButton
            label="Submit Review"
            onPress={handleSubmit}
            loading={submitting || loadingTargets}
            disabled={!!targetError || !selectedTarget || projectStatus !== 'completed'}
            fullWidth
            size="lg"
            haptic
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h2 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },
  overallCard: { alignItems: 'center', marginBottom: Spacing.sm },
  overallStars: { fontSize: 36, color: Colors.warning, letterSpacing: 4, marginBottom: 4 },
  overallLabel: { ...Typography.caption },
  dimCard: { marginBottom: 10 },
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dimIcon: { fontSize: 20 },
  dimLabel: { ...Typography.body, flex: 1 },
  starRow: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 32, color: Colors.glass.border },
  starFilled: { color: Colors.warning },
  commentCard: { marginBottom: Spacing.sm },
  sectionLabel: { ...Typography.label, marginBottom: 10 },
  lockedCopy: { ...Typography.bodySecondary, lineHeight: 20 },
  errorCard: { borderColor: 'rgba(224,11,11,0.28)' },
  errorCopy: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: 10 },
  retryButton: { alignSelf: 'flex-start' },
  targetList: { gap: 8 },
  targetPill: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  targetPillActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  targetName: { ...Typography.body, fontWeight: '600' },
  targetNameActive: { color: Colors.accent },
  targetTrade: { ...Typography.caption, marginTop: 3, textTransform: 'capitalize' },
  reviewingName: { ...Typography.h3, marginBottom: 2 },
  commentInput: {
    minHeight: 100, fontSize: 15, lineHeight: 22,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: 12,
  },
  charCount: { ...Typography.caption, textAlign: 'right', marginTop: 6 },
});
