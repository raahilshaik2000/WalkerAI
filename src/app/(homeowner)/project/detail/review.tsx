import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

const DIMENSIONS = [
  { key: 'quality', label: 'Work Quality', emoji: '🔨' },
  { key: 'communication', label: 'Communication', emoji: '💬' },
  { key: 'timeliness', label: 'On-Time Delivery', emoji: '⏱️' },
  { key: 'cleanliness', label: 'Cleanliness', emoji: '🧹' },
];

function StarRow({ rating, onRate }: { rating: number; onRate: (n: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <AnimatedPressable key={n} onPress={() => onRate(n)} haptic>
          <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={28} color={n <= rating ? '#F59E0B' : Colors.text.tertiary} />
        </AnimatedPressable>
      ))}
    </View>
  );
}

export default function DetailReviewScreen() {
  const navigation = useNavigation<any>();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');

  const setRating = (key: string, value: number) => setRatings((prev) => ({ ...prev, [key]: value }));

  const ratedCount = Object.keys(ratings).filter((k) => ratings[k] > 0).length;
  const overall = ratedCount > 0 ? Object.values(ratings).reduce((a, b) => a + b, 0) / ratedCount : 0;
  const canSubmit = ratedCount === 4;

  const handleSubmit = () => {
    Alert.alert('Submit Review', 'Submit your review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => {
        Alert.alert('Review Submitted', 'Thank you for your feedback!');
        navigation.goBack();
      }},
    ]);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Leave a Review</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Overall preview */}
          <GlassCard style={styles.overallCard}>
            <Text style={styles.overallLabel}>Overall Rating</Text>
            <Text style={styles.overallValue}>{overall > 0 ? overall.toFixed(1) : '—'}</Text>
            <View style={styles.overallStars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons key={n} name={n <= Math.round(overall) ? 'star' : 'star-outline'} size={20} color={n <= Math.round(overall) ? '#F59E0B' : Colors.text.tertiary} />
              ))}
            </View>
          </GlassCard>

          {/* Dimensions */}
          {DIMENSIONS.map((dim) => (
            <GlassCard key={dim.key} style={styles.dimCard}>
              <View style={styles.dimRow}>
                <Text style={styles.dimEmoji}>{dim.emoji}</Text>
                <Text style={styles.dimLabel}>{dim.label}</Text>
              </View>
              <StarRow rating={ratings[dim.key] ?? 0} onRate={(n) => setRating(dim.key, n)} />
            </GlassCard>
          ))}

          {/* Comment */}
          <Text style={styles.commentLabel}>Comment (optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Share your experience..."
            placeholderTextColor={Colors.text.tertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            selectionColor={Colors.accent}
          />
          <Text style={styles.charCount}>{comment.length}/1000</Text>

          <GlassButton
            label="Submit Review"
            onPress={handleSubmit}
            variant="primary"
            fullWidth
            haptic
            size="lg"
            disabled={!canSubmit}
            style={{ marginTop: Spacing.md }}
            icon={<Ionicons name="star" size={18} color={canSubmit ? '#000' : Colors.text.tertiary} />}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },
  overallCard: { alignItems: 'center', marginBottom: 16 },
  overallLabel: { fontSize: 13, color: Colors.text.tertiary, marginBottom: 4 },
  overallValue: { fontSize: 40, fontWeight: '700', color: '#fff', marginBottom: 4 },
  overallStars: { flexDirection: 'row', gap: 4 },
  dimCard: { marginBottom: 10 },
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dimEmoji: { fontSize: 20 },
  dimLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  starRow: { flexDirection: 'row', gap: 8 },
  commentLabel: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 8, marginBottom: 8 },
  commentInput: {
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    padding: 14, fontSize: 14, color: '#fff',
    minHeight: 100, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: Colors.text.tertiary, alignSelf: 'flex-end', marginTop: 4 },
});
