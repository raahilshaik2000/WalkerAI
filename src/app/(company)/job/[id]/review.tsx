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
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';

const DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: 'communication_rating', label: 'Communication' },
  { key: 'timeliness_rating', label: 'Decision Speed' },
  { key: 'cleanliness_rating', label: 'Site Readiness' },
  { key: 'quality_rating', label: 'Project Fit' },
];

function StarRow({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <TouchableOpacity
          key={rating}
          onPress={() => onChange(rating)}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[styles.star, rating <= value && styles.starFilled]}>
            {rating <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

export default function CompanyHomeownerReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const { user } = useAuthStore();

  const [homeowner, setHomeowner] = useState<{ id: string; email: string | null; full_name?: string | null } | null>(null);
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({
    communication_rating: 0,
    timeliness_rating: 0,
    cleanliness_rating: 0,
    quality_rating: 0,
  });

  const overallRating = Math.round(
    Object.values(ratings).reduce((sum, rating) => sum + rating, 0) / DIMENSIONS.length
  );

  const fetchReviewContext = useCallback(async () => {
    setLoading(true);
    if (!projectId || !user?.id) {
      setHomeowner(null);
      setProjectStatus(null);
      setLoading(false);
      return;
    }

    let projectResult: any = await supabase
      .from('projects')
      .select('homeowner_id, status, homeowner:users!projects_homeowner_id_fkey(id, email, full_name)')
      .eq('id', projectId)
      .maybeSingle();

    if (isMissingColumnError(projectResult.error)) {
      projectResult = await supabase
        .from('projects')
        .select('homeowner_id, status, homeowner:users!projects_homeowner_id_fkey(id, email)')
        .eq('id', projectId)
        .maybeSingle();
    }

    if (projectResult.error) {
      Alert.alert('Error', projectResult.error.message);
      setLoading(false);
      return;
    }

    const homeownerRow = Array.isArray((projectResult.data as any)?.homeowner)
      ? (projectResult.data as any).homeowner[0]
      : (projectResult.data as any)?.homeowner;
    const homeownerId = (projectResult.data as any)?.homeowner_id as string | undefined;

    if (!homeownerId) {
      setHomeowner(null);
      setProjectStatus((projectResult.data as any)?.status ?? null);
      setLoading(false);
      return;
    }

    setHomeowner({ id: homeownerId, email: homeownerRow?.email ?? null, full_name: homeownerRow?.full_name ?? null });
    setProjectStatus((projectResult.data as any)?.status ?? null);

    const existingResult = await supabase
      .from('reviews')
      .select('id')
      .eq('project_id', projectId)
      .eq('reviewer_id', user.id)
      .eq('reviewee_id', homeownerId)
      .maybeSingle();

    if (existingResult.error) {
      Alert.alert('Error', existingResult.error.message);
    } else {
      setExistingReviewId(existingResult.data?.id ?? null);
    }

    setLoading(false);
  }, [projectId, user?.id]);

  useEffect(() => {
    fetchReviewContext();
  }, [fetchReviewContext]);

  const handleSubmit = async () => {
    if (!projectId || !user?.id || !homeowner?.id) {
      Alert.alert('Missing project', 'Reopen this review from the completed job page.');
      return;
    }
    if (projectStatus !== 'completed') {
      Alert.alert('Project not complete', 'Homeowner reviews open after the project is completed.');
      return;
    }
    if (existingReviewId) {
      Alert.alert('Already reviewed', 'You have already reviewed this homeowner for this project.');
      return;
    }

    const unrated = DIMENSIONS.filter((dimension) => !ratings[dimension.key]);
    if (unrated.length > 0) {
      Alert.alert('Rate all categories', `Please rate: ${unrated.map((dimension) => dimension.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('reviews')
        .insert({
          project_id: projectId,
          reviewer_id: user.id,
          reviewee_id: homeowner.id,
          rating: overallRating,
          quality_rating: ratings.quality_rating,
          communication_rating: ratings.communication_rating,
          timeliness_rating: ratings.timeliness_rating,
          cleanliness_rating: ratings.cleanliness_rating,
          comment: comment.trim() || null,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        if (/duplicate key|reviews_project_id_reviewer_id_key|reviews_project_reviewer_reviewee_unique/i.test(error.message)) {
          throw new Error('You have already reviewed this homeowner for this project.');
        }
        if (/row-level security|permission denied|violates row-level security/i.test(error.message)) {
          throw new Error('This environment needs the company-to-homeowner review policy migration before contractor reviews can be saved.');
        }
        throw error;
      }
      if (!data) throw new Error('Review was not saved.');

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setExistingReviewId(data.id);
      Alert.alert('Review submitted', 'Thanks for closing out this project.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = homeowner?.full_name || homeowner?.email || 'Homeowner';
  const disabled = loading || submitting || !!existingReviewId || projectStatus !== 'completed';

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Review Homeowner</Text>
            <View style={{ width: 36 }} />
          </View>

          {loading ? (
            <>
              <ListItemSkeleton style={styles.skeleton} />
              <ListItemSkeleton style={styles.skeleton} />
            </>
          ) : (
            <>
              <GlassCard style={styles.card}>
                <Text style={styles.sectionLabel}>Reviewing</Text>
                <Text style={styles.homeownerName}>{displayName}</Text>
                {projectStatus !== 'completed' ? (
                  <Text style={styles.helperText}>This review unlocks once the project is completed.</Text>
                ) : existingReviewId ? (
                  <Text style={styles.successText}>Review already submitted.</Text>
                ) : (
                  <Text style={styles.helperText}>Rate the project closeout experience with this homeowner.</Text>
                )}
              </GlassCard>

              <GlassCard style={styles.overallCard}>
                <Text style={styles.overallStars}>{'★'.repeat(overallRating)}{'☆'.repeat(5 - overallRating)}</Text>
                <Text style={styles.helperText}>Overall rating</Text>
              </GlassCard>

              {DIMENSIONS.map((dimension) => (
                <GlassCard key={dimension.key} style={styles.card}>
                  <Text style={styles.dimensionLabel}>{dimension.label}</Text>
                  <StarRow
                    value={ratings[dimension.key]}
                    onChange={(value) => setRatings((prev) => ({ ...prev, [dimension.key]: value }))}
                  />
                </GlassCard>
              ))}

              <GlassCard style={styles.card}>
                <Text style={styles.sectionLabel}>Notes</Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Share context for future contractors..."
                  placeholderTextColor={Colors.text.tertiary}
                  multiline
                  maxLength={1000}
                  style={styles.input}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{comment.length}/1000</Text>
              </GlassCard>

              <GlassButton
                label={existingReviewId ? 'Review Submitted' : 'Submit Review'}
                onPress={handleSubmit}
                loading={submitting}
                disabled={disabled}
                fullWidth
                size="lg"
                haptic
                style={styles.submitButton}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  title: { ...Typography.h2 },
  skeleton: { marginBottom: 10 },
  card: { marginBottom: 10 },
  overallCard: { alignItems: 'center', marginBottom: 10 },
  sectionLabel: { ...Typography.label, marginBottom: 6 },
  homeownerName: { ...Typography.h3, marginBottom: 4 },
  helperText: { ...Typography.bodySecondary, lineHeight: 20 },
  successText: { color: Colors.success, fontSize: 13, fontWeight: '700' },
  overallStars: { fontSize: 30, color: '#FFB020', letterSpacing: 1, marginBottom: 4 },
  dimensionLabel: { ...Typography.body, fontWeight: '700', marginBottom: 8 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  star: { fontSize: 34, color: Colors.text.tertiary },
  starFilled: { color: '#FFB020' },
  input: {
    minHeight: 110,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    padding: 12,
    color: Colors.text.primary,
    fontSize: 15,
    lineHeight: 21,
  },
  charCount: { ...Typography.caption, alignSelf: 'flex-end', marginTop: 6 },
  submitButton: { marginTop: 4 },
});
