import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassCard, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';

interface Review {
  id: string;
  rating: number;
  quality_rating: number | null;
  communication_rating: number | null;
  timeliness_rating: number | null;
  cleanliness_rating: number | null;
  comment: string | null;
  created_at: string;
  project: { room_type: string | null } | null;
  company: { name: string } | null;
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= Math.round(rating) ? 'star' : 'star-outline'} size={14} color={n <= Math.round(rating) ? '#F59E0B' : Colors.text.tertiary} />
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProjectTitle(roomType: string | null): string {
  if (!roomType) return 'Project';
  return roomType.charAt(0).toUpperCase() + roomType.slice(1) + ' Renovation';
}

export default function MyReviewsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('reviews')
      .select(`
        id, rating, quality_rating, communication_rating, timeliness_rating, cleanliness_rating, comment, created_at,
        project:projects!project_id(room_type, assigned_company_id, companies!assigned_company_id(name))
      `)
      .eq('reviewer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const mapped: Review[] = (data ?? []).map((r: any) => ({
          id: r.id,
          rating: r.rating,
          quality_rating: r.quality_rating,
          communication_rating: r.communication_rating,
          timeliness_rating: r.timeliness_rating,
          cleanliness_rating: r.cleanliness_rating,
          comment: r.comment,
          created_at: r.created_at,
          project: r.project ?? null,
          company: r.project?.companies ?? null,
        }));
        setReviews(mapped);
        setLoading(false);
      });
  }, [user]);

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
          {!loading && reviews.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptySub}>Complete a project to leave a review for your contractor.</Text>
            </View>
          )}

          {reviews.map((r) => (
            <GlassCard key={r.id} style={{ marginBottom: 12 }}>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.project}>{getProjectTitle(r.project?.room_type ?? null)}</Text>
                  <Text style={styles.contractor}>{r.company?.name ?? 'Contractor'}</Text>
                </View>
                <View style={styles.overallBadge}>
                  <Text style={styles.overallText}>{r.rating}</Text>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                </View>
              </View>

              <View style={styles.ratingsGrid}>
                {r.quality_rating != null && <RatingItem label="Quality" rating={r.quality_rating} />}
                {r.communication_rating != null && <RatingItem label="Communication" rating={r.communication_rating} />}
                {r.timeliness_rating != null && <RatingItem label="Timeliness" rating={r.timeliness_rating} />}
                {r.cleanliness_rating != null && <RatingItem label="Cleanliness" rating={r.cleanliness_rating} />}
              </View>

              {r.comment ? <Text style={styles.comment}>"{r.comment}"</Text> : null}
              <Text style={styles.date}>{formatDate(r.created_at)}</Text>
            </GlassCard>
          ))}
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
