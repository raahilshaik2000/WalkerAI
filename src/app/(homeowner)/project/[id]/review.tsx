import { useState } from 'react';
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
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

const DIMENSIONS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'quality_rating', label: 'Work Quality', icon: '🔨' },
  { key: 'communication_rating', label: 'Communication', icon: '💬' },
  { key: 'timeliness_rating', label: 'On-Time Delivery', icon: '⏱️' },
  { key: 'cleanliness_rating', label: 'Cleanliness', icon: '🧹' },
];

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
  const projectId = route.params?.id;
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

  const overallRating = Math.round(
    Object.values(ratings).reduce((s, v) => s + v, 0) / DIMENSIONS.length
  );

  const handleSubmit = async () => {
    const unrated = DIMENSIONS.filter((d) => !ratings[d.key]);
    if (unrated.length > 0) {
      Alert.alert('Rate all categories', `Please rate: ${unrated.map((d) => d.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      // Duplicate guard
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('project_id', projectId)
        .eq('reviewer_id', user!.id)
        .maybeSingle();

      if (existing) {
        Alert.alert('Already reviewed', 'You have already submitted a review for this project.');
        return;
      }

      // Get the company that did this project
      const { data: project } = await supabase
        .from('projects')
        .select('assigned_company_id, companies:assigned_company_id(user_id)')
        .eq('id', projectId)
        .single();

      if (!project?.assigned_company_id) throw new Error('No contractor found');

      const companyUserId = (project.companies as any)?.user_id;

      await supabase.from('reviews').insert({
        project_id: projectId,
        reviewer_id: user!.id,
        reviewee_id: companyUserId,
        rating: overallRating,
        quality_rating: ratings.quality_rating,
        communication_rating: ratings.communication_rating,
        timeliness_rating: ratings.timeliness_rating,
        cleanliness_rating: ratings.cleanliness_rating,
        comment: comment.trim() || null,
      });

      // Update company aggregate rating
      await supabase.rpc('update_company_rating', { p_company_id: project.assigned_company_id });

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
            loading={submitting}
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
  commentInput: {
    minHeight: 100, fontSize: 15, lineHeight: 22,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: 12,
  },
  charCount: { ...Typography.caption, textAlign: 'right', marginTop: 6 },
});
