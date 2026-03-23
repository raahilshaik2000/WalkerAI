import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';

const REVIEWS = [
  {
    id: 'r1',
    projectTitle: 'Guest Bathroom Refresh',
    contractorName: 'AquaTile Bathrooms',
    date: 'Mar 6, 2026',
    overall: 4.8,
    quality: 5,
    communication: 5,
    timeliness: 4,
    cleanliness: 5,
    comment: 'Excellent work on the guest bathroom. The tile work was flawless and they cleaned up perfectly every day. Would definitely hire again!',
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= Math.round(rating) ? 'star' : 'star-outline'} size={14} color={n <= Math.round(rating) ? '#F59E0B' : Colors.text.tertiary} />
      ))}
    </View>
  );
}

export default function MyReviewsScreen() {
  const navigation = useNavigation<any>();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>My Reviews</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {REVIEWS.map((r) => (
            <GlassCard key={r.id}>
              <View style={styles.topRow}>
                <View>
                  <Text style={styles.project}>{r.projectTitle}</Text>
                  <Text style={styles.contractor}>{r.contractorName}</Text>
                </View>
                <View style={styles.overallBadge}>
                  <Text style={styles.overallText}>{r.overall}</Text>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                </View>
              </View>

              <View style={styles.ratingsGrid}>
                <RatingItem label="Quality" rating={r.quality} />
                <RatingItem label="Communication" rating={r.communication} />
                <RatingItem label="Timeliness" rating={r.timeliness} />
                <RatingItem label="Cleanliness" rating={r.cleanliness} />
              </View>

              {r.comment && <Text style={styles.comment}>"{r.comment}"</Text>}
              <Text style={styles.date}>{r.date}</Text>
            </GlassCard>
          ))}

          {REVIEWS.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptySub}>Complete a project to leave a review for your contractor.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function RatingItem({ label, rating }: { label: string; rating: number }) {
  return (
    <View style={styles.ratingItem}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <Stars rating={rating} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  project: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  contractor: { fontSize: 13, color: Colors.text.tertiary },
  overallBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F59E0B22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill,
  },
  overallText: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },

  ratingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  ratingItem: { width: '45%' },
  ratingLabel: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 3 },
  starsRow: { flexDirection: 'row', gap: 2 },

  comment: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 20, marginBottom: 8 },
  date: { fontSize: 11, color: Colors.text.tertiary },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center' },
});
