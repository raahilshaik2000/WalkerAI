import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
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
  reviewee_id: string;
  project: { room_type: string | null } | null;
  contractor: { name: string; roleLabel: string } | null;
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
  const hasLoadedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReviews = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user) {
      setReviews([]);
      setErrorMessage('Sign in to view your reviews.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === 'refresh') setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('reviews')
      .select(`
        id, rating, quality_rating, communication_rating, timeliness_rating, cleanliness_rating, comment, created_at, reviewee_id,
        project:projects!project_id(room_type)
      `)
      .eq('reviewer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setReviews([]);
      setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load reviews.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const rows = (data ?? []) as any[];
    const revieweeIds = Array.from(new Set(
      rows
        .map((r) => r.reviewee_id)
        .filter((id): id is string => !!id)
    ));

    const contractorsByUserId = new Map<string, { name: string; roleLabel: string }>();
    if (revieweeIds.length > 0) {
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('user_id, name')
        .in('user_id', revieweeIds);

      if (companiesError) {
        setReviews([]);
        setErrorMessage(formatAppSafeErrorMessage(companiesError, 'Could not load review recipients.'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      for (const company of companies ?? []) {
        if (company.user_id) {
          contractorsByUserId.set(company.user_id, {
            name: company.name ?? 'Contractor',
            roleLabel: 'Trade contractor',
          });
        }
      }

      const { data: generalContractors, error: gcError } = await supabase
        .from('general_contractors')
        .select('user_id, business_name')
        .in('user_id', revieweeIds);

      if (gcError) {
        setReviews([]);
        setErrorMessage(formatAppSafeErrorMessage(gcError, 'Could not load review recipients.'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      for (const gc of generalContractors ?? []) {
        if (gc.user_id) {
          contractorsByUserId.set(gc.user_id, {
            name: gc.business_name ?? 'General Contractor',
            roleLabel: 'General contractor',
          });
        }
      }
    }

    const mapped: Review[] = rows.map((r: any) => ({
      id: r.id,
      rating: r.rating,
      quality_rating: r.quality_rating,
      communication_rating: r.communication_rating,
      timeliness_rating: r.timeliness_rating,
      cleanliness_rating: r.cleanliness_rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewee_id: r.reviewee_id,
      project: r.project ?? null,
      contractor: contractorsByUserId.get(r.reviewee_id) ?? null,
    }));
    setReviews(mapped);
    setErrorMessage(null);
    hasLoadedRef.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

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

        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadReviews('refresh')} tintColor={Colors.accent} />}
          >
            {errorMessage ? (
              <View style={styles.empty}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>Could not load reviews</Text>
                <Text style={styles.emptySub}>{errorMessage}</Text>
                <GlassButton label="Try Again" onPress={() => loadReviews()} size="sm" style={{ marginTop: 10 }} />
              </View>
            ) : reviews.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="star-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptySub}>Complete a project to leave a review for your contractor.</Text>
              </View>
            ) : null}

            {reviews.map((r) => (
              <GlassCard key={r.id} style={{ marginBottom: 12 }}>
                <View style={styles.topRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.project}>{getProjectTitle(r.project?.room_type ?? null)}</Text>
                    <Text style={styles.contractor}>
                      {r.contractor ? `${r.contractor.name} - ${r.contractor.roleLabel}` : 'Contractor'}
                    </Text>
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
        )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
