import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface Company {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  service_radius_km: number;
  verified: boolean;
  rating: number | null;
  total_reviews: number;
  license_number: string | null;
  stripe_account_id: string | null;
}

interface EarningsSummary {
  total_paid: number;
  active_count: number;
  completed_count: number;
}

export default function CompanyProfileScreen() {
  const { user, clearSession } = useAuthStore();
  const navigation = useNavigation<any>();
  const [company, setCompany] = useState<Company | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary>({ total_paid: 0, active_count: 0, completed_count: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data: co } = await supabase
      .from('companies')
      .select('id, name, address, city, province, service_radius_km, verified, rating, total_reviews, license_number, stripe_account_id')
      .eq('user_id', user.id)
      .single();

    setCompany(co as Company | null);

    if (co?.id) {
      // Count active and completed projects
      const { data: projects } = await supabase
        .from('projects')
        .select('status')
        .eq('assigned_company_id', co.id)
        .in('status', ['accepted', 'quoting', 'active', 'completed']);

      const active = projects?.filter((p) => p.status !== 'completed').length ?? 0;
      const completed = projects?.filter((p) => p.status === 'completed').length ?? 0;

      // Sum paid milestones
      const { data: milestones } = await supabase
        .from('milestones')
        .select('amount, quotes!inner(company_id)')
        .eq('status', 'paid')
        .eq('quotes.company_id', co.id);

      const totalPaid = milestones?.reduce((s: number, m: any) => s + m.amount, 0) ?? 0;
      setEarnings({ total_paid: totalPaid, active_count: active, completed_count: completed });
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          clearSession();
        },
      },
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const [connectLoading, setConnectLoading] = useState(false);

  const handleSetupPayouts = async () => {
    setConnectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account');
      if (error) throw error;
      if (data?.url) {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not start payout setup. Please try again.');
    } finally {
      setConnectLoading(false);
    }
  };

  function formatCad(cents: number) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <Text style={styles.pageTitle}>Profile</Text>

          {/* Identity card */}
          <GlassCard style={styles.card}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {company?.name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                {company?.verified ? (
                  <StatusBadge label="Verified" variant="completed" size="sm" dot />
                ) : (
                  <StatusBadge label="Pending verification" variant="pending" size="sm" />
                )}
              </View>
            </View>

            {company?.rating != null && (
              <View style={styles.ratingRow}>
                <View style={styles.ratingStars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon
                      key={i}
                      name={i < Math.round(company.rating!) ? 'star' : 'star-outline'}
                      size={16}
                      color={i < Math.round(company.rating!) ? Colors.warning : Colors.text.tertiary}
                    />
                  ))}
                </View>
                <Text style={styles.ratingValue}>{company.rating.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({company.total_reviews} reviews)</Text>
              </View>
            )}
          </GlassCard>

          {/* Stats */}
          <View style={styles.statsRow}>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statValue}>{earnings.active_count}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statValue}>{earnings.completed_count}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statValue}>{formatCad(earnings.total_paid)}</Text>
              <Text style={styles.statLabel}>Earned</Text>
            </GlassCard>
          </View>

          {/* Business info */}
          {company && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Business Info</Text>
              {company.address && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Address</Text>
                  <Text style={styles.infoVal}>{company.address}{company.city ? `, ${company.city}` : ''}</Text>
                </View>
              )}
              {company.province && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Province</Text>
                  <Text style={styles.infoVal}>{company.province}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Service radius</Text>
                <Text style={styles.infoVal}>{company.service_radius_km} km</Text>
              </View>
              {company.license_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>License</Text>
                  <Text style={styles.infoVal}>{company.license_number}</Text>
                </View>
              )}
              <View style={[styles.infoRow, { borderBottomWidth: company.stripe_account_id ? 0 : 1 }]}>
                <Text style={styles.infoKey}>Stripe</Text>
                <Text style={[styles.infoVal, company.stripe_account_id ? styles.connected : styles.notConnected]}>
                  {company.stripe_account_id ? 'Connected ✓' : 'Not connected'}
                </Text>
              </View>
              {!company.stripe_account_id && (
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <GlassButton
                    label={connectLoading ? 'Opening…' : 'Set up payouts'}
                    onPress={handleSetupPayouts}
                    loading={connectLoading}
                    fullWidth
                    size="sm"
                    style={{ marginTop: 4 }}
                  />
                </View>
              )}
            </GlassCard>
          )}

          {/* Actions */}
          <GlassCard style={styles.card}>
            <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Earnings')}>
              <View style={styles.menuIcon}>
                <Icon name="cash-multiple" size={20} color={Colors.text.secondary} />
              </View>
              <Text style={styles.menuLabel}>Earnings & Payouts</Text>
              <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Calendar')}>
              <View style={styles.menuIcon}>
                <Icon name="calendar-month-outline" size={20} color={Colors.text.secondary} />
              </View>
              <Text style={styles.menuLabel}>Calendar</Text>
              <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </GlassCard>

          <GlassButton
            label="Sign Out"
            onPress={handleSignOut}
            variant="destructive"
            fullWidth
            style={styles.signOutBtn}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  pageTitle: { ...Typography.h1, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.accent, fontSize: 22, fontWeight: '700' },
  companyName: { ...Typography.h3, marginBottom: 2 },
  email: { ...Typography.caption, marginBottom: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingStars: { flexDirection: 'row' as const, gap: 2 },
  ratingValue: { color: Colors.text.primary, fontWeight: '700', fontSize: 14 },
  ratingCount: { ...Typography.caption },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.sm },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 16, marginBottom: 0 },
  statValue: { fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  statLabel: { ...Typography.caption },
  sectionLabel: { ...Typography.label, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.glass.border,
  },
  infoKey: { ...Typography.bodySecondary, flex: 1 },
  infoVal: { ...Typography.body, flex: 2, textAlign: 'right' },
  connected: { color: Colors.success },
  notConnected: { color: Colors.warning },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.glass.border,
  },
  menuIcon: { width: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuLabel: { ...Typography.body, flex: 1 },
  signOutBtn: { marginTop: Spacing.sm },
});
