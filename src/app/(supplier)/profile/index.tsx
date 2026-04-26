import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';
import type { Supplier } from '@/types/database.types';

export default function SupplierProfile() {
  const { user, setSession } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from('suppliers').select('*').eq('user_id', user.id).single();
      setSupplier(data);
      setLoading(false);
    })();
  }, [user]);

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); setSession(null); } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Avatar & name */}
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{supplier?.business_name?.[0]?.toUpperCase() ?? 'S'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{supplier?.business_name ?? 'Supplier'}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              {supplier?.verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                  <Text style={styles.verifiedText}>Verified Supplier</Text>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Ionicons name="time-outline" size={14} color={Colors.accent} />
                  <Text style={styles.pendingText}>Pending Verification</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats */}
          {supplier?.verified && (
            <View style={styles.statsRow}>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1}>{supplier.rating?.toFixed(1) ?? '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Rating</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1}>{supplier.total_reviews}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Reviews</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1}>{supplier.fulfillment_rate ? `${supplier.fulfillment_rate.toFixed(0)}%` : '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>On-time</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1}>{supplier.avg_delivery_days ?? '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Avg days</Text>
              </GlassCard>
            </View>
          )}

          {/* Business info */}
          <GlassCard style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Business Details</Text>
            <InfoRow icon="location-outline" label={`${supplier?.city ?? ''}, ${supplier?.province ?? ''}`} />
            <InfoRow icon="radio-outline" label={`${supplier?.service_radius_km ?? 100} km service radius`} />
            {supplier?.license_number && <InfoRow icon="document-outline" label={`License: ${supplier.license_number}`} />}
          </GlassCard>

          {/* Categories */}
          {supplier?.categories && supplier.categories.length > 0 && (
            <GlassCard style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Supply Categories</Text>
              <View style={styles.catWrap}>
                {supplier.categories.map((c) => (
                  <View key={c} style={styles.catChip}>
                    <Text style={styles.catChipText}>{c}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          )}

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color="#FF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={irStyles.row}>
      <Ionicons name={icon} size={16} color={Colors.text.tertiary} />
      <Text style={irStyles.text}>{label}</Text>
    </View>
  );
}

const irStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  text: { fontSize: 14, color: Colors.text.secondary },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 100, gap: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,107,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.accent },
  name: { fontSize: 20, fontWeight: '800', color: Colors.text.primary },
  email: { fontSize: 13, color: Colors.text.tertiary, marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  verifiedText: { fontSize: 12, color: '#34D399', fontWeight: '600' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  pendingText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, padding: 8, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 14, fontWeight: '800', color: Colors.text.primary },
  statLabel: { fontSize: 9, color: Colors.text.tertiary, textAlign: 'center' },
  infoCard: { padding: Spacing.md, gap: 2 },
  sectionTitle: { fontSize: 12, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,107,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)' },
  catChipText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, justifyContent: 'center', marginTop: 8 },
  signOutText: { fontSize: 15, color: '#FF4444', fontWeight: '600' },
});
