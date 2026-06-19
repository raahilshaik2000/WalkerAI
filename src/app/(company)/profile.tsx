import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import { TradeMetricStrip, TradeScreenHeader } from '@/components/company/TradeUI';

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
  insurance_doc_url: string | null;
  wc_doc_url?: string | null;
  stripe_account_id: string | null;
  stripe_details_submitted?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_transfers_active?: boolean | null;
  stripe_onboarding_checked_at?: string | null;
  trade_types: string[] | null;
  primary_trade: string | null;
}

interface EarningsSummary {
  total_paid: number;
  active_count: number;
  completed_count: number;
}

const TRADE_LABELS: Record<string, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile Installer',
  cabinet_installer: 'Cabinet Installer',
  painter: 'Painter',
  flooring_installer: 'Flooring Installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

function companyServiceLabels(tradeTypes?: string[] | null) {
  const visibleTrades = (tradeTypes ?? []).filter((trade) => trade !== 'general_contractor');
  if (!visibleTrades.length) return 'Services not selected';
  return visibleTrades
    .map((trade) => TRADE_LABELS[trade] ?? trade.replace(/_/g, ' '))
    .join(', ');
}

function nextCompanyOnboardingRoute(company: Pick<Company, 'license_number' | 'insurance_doc_url'> | null): string | null {
  if (!company) return 'BusinessOnboarding';
  if (!company.license_number) return 'LicenseOnboarding';
  if (!company.insurance_doc_url) return 'InsuranceOnboarding';
  return null;
}

function getJoinedProjectStatus(row: any) {
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  return project?.status as string | undefined;
}

function isMissingColumnError(message?: string | null) {
  if (!message) return false;
  // Match both Postgres ("column ... does not exist") and PostgREST
  // ("Could not find the 'X' column of 'Y' in the schema cache") formats.
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

async function fetchCompanyProfile(userId: string) {
  const withReadiness = await supabase
    .from('companies')
    .select(`
      id, name, address, city, province, service_radius_km, verified, rating,
      total_reviews, license_number, insurance_doc_url, wc_doc_url,
      stripe_account_id, stripe_details_submitted,
      stripe_payouts_enabled, stripe_transfers_active, stripe_onboarding_checked_at,
      trade_types, primary_trade
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withReadiness.error) return withReadiness.data as Company | null;
  if (!isMissingColumnError(withReadiness.error.message)) throw withReadiness.error;

  const legacy = await supabase
    .from('companies')
    .select(`
      id, name, address, city, province, service_radius_km, verified, rating,
      total_reviews, license_number, insurance_doc_url, wc_doc_url,
      stripe_account_id, trade_types, primary_trade
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacy.error) throw legacy.error;
  return legacy.data
    ? {
      ...legacy.data,
      stripe_details_submitted: null,
      stripe_payouts_enabled: null,
      stripe_transfers_active: null,
      stripe_onboarding_checked_at: null,
    } as Company
    : null;
}

export default function CompanyProfileScreen() {
  const { user, clearSession } = useAuthStore();
  const navigation = useNavigation<any>();
  const [company, setCompany] = useState<Company | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary>({ total_paid: 0, active_count: 0, completed_count: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view your company profile.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setErrorMessage(null);
    await supabase.functions.invoke('refresh-connect-status');

    let co: Company | null = null;
    try {
      co = await fetchCompanyProfile(currentUser.id);
    } catch (companyError) {
      setCompany(null);
      setEarnings({ total_paid: 0, active_count: 0, completed_count: 0 });
      setErrorMessage(formatAppSafeErrorMessage(companyError, 'Could not load company profile.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setCompany(co as Company | null);

    if (co?.id) {
      const statusByProject = new Map<string, string>();

      // Count legacy single-company assignments.
      const { data: legacyProjects, error: legacyProjectsError } = await supabase
        .from('projects')
        .select('id, status')
        .eq('assigned_company_id', co.id)
        .in('status', ['accepted', 'quoting', 'scheduling', 'active', 'completed']);
      if (legacyProjectsError) {
        setErrorMessage(formatAppSafeErrorMessage(legacyProjectsError, 'Could not load company projects.'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      for (const project of legacyProjects ?? []) {
        statusByProject.set(project.id, project.status);
      }

      // Count projects accepted through trade slots.
      const { data: slotProjects, error: slotProjectsError } = await supabase
        .from('project_slots')
        .select('project_id, projects(status)')
        .eq('assigned_company_id', co.id)
        .in('status', ['filled', 'scheduled']);
      if (slotProjectsError) {
        setErrorMessage(formatAppSafeErrorMessage(slotProjectsError, 'Could not load company projects.'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      for (const row of slotProjects ?? []) {
        const status = getJoinedProjectStatus(row);
        if (status) statusByProject.set(row.project_id, status);
      }

      const statuses = Array.from(statusByProject.values());
      const active = statuses.filter((status) => status !== 'completed').length;
      const completed = statuses.filter((status) => status === 'completed').length;

      // Sum paid milestones
      const { data: milestones, error: milestonesError } = await supabase
        .from('milestones')
        .select('amount, quotes!inner(company_id)')
        .eq('status', 'paid')
        .eq('quotes.company_id', co.id);
      if (milestonesError) {
        setErrorMessage(formatAppSafeErrorMessage(milestonesError, 'Could not load company earnings.'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const paidMilestoneValue = milestones?.reduce((s: number, m: any) => s + Number(m.amount ?? 0), 0) ?? 0;
      setEarnings({ total_paid: paidMilestoneValue, active_count: active, completed_count: completed });
    } else {
      setEarnings({ total_paid: 0, active_count: 0, completed_count: 0 });
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchData();
    });
    return () => subscription.remove();
  }, [fetchData]);

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
  const payoutReady = isStripePayoutLocallyReady(company);
  const setupRoute = nextCompanyOnboardingRoute(company);

  const handleSetupPayouts = async () => {
    if (!company?.id) {
      Alert.alert('Company profile required', 'Complete contractor onboarding before setting up payouts.');
      return;
    }
    setConnectLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account');
      if (error) throw error;
      if (data?.url) {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      Alert.alert('Error', await formatSupabaseFunctionError(err, 'Could not start payout setup. Please try again.'));
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
          <TradeScreenHeader title="Profile" subtitle="Business status, payouts, and account controls" />

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Profile unavailable</Text>
              <Text style={styles.infoVal}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Profile</Text>
              <Text style={styles.infoVal}>Loading company profile...</Text>
            </GlassCard>
          ) : !company ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Contractor setup</Text>
              <Text style={styles.infoVal}>Complete your company profile before accepting jobs or setting up payouts.</Text>
              <GlassButton
                label="Start Setup"
                onPress={() => navigation.navigate('BusinessOnboarding')}
                style={{ marginTop: Spacing.sm }}
              />
            </GlassCard>
          ) : null}

          {/* Identity card */}
          <GlassCard style={styles.card}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {company?.name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.companyName}>{loading ? 'Loading company...' : company?.name ?? 'Your Company'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                {!loading && company?.verified ? (
                  <StatusBadge label="Verified" variant="completed" size="sm" dot />
                ) : !loading && setupRoute ? (
                  <TouchableOpacity
                    style={styles.continueSetupBtn}
                    onPress={() => navigation.navigate(setupRoute)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.continueSetupText}>Continue setup</Text>
                  </TouchableOpacity>
                ) : !loading ? (
                  <StatusBadge label="Pending verification" variant="pending" size="sm" />
                ) : null}
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
          <TradeMetricStrip
            items={[
              { label: 'Active', value: earnings.active_count, tone: earnings.active_count ? 'success' : 'muted' },
              { label: 'Completed', value: earnings.completed_count, tone: earnings.completed_count ? 'success' : 'muted' },
              { label: 'Paid value', value: formatCad(earnings.total_paid), tone: earnings.total_paid ? 'success' : 'muted' },
            ]}
          />

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
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Services</Text>
                <Text style={styles.infoVal}>{companyServiceLabels(company.trade_types)}</Text>
              </View>
              {company.license_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>License</Text>
                  <Text style={styles.infoVal}>{company.license_number}</Text>
                </View>
              )}
              {!company.license_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>License</Text>
                  <Text style={[styles.infoVal, styles.notConnected]}>Required</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Insurance</Text>
                <Text style={[styles.infoVal, company.insurance_doc_url ? styles.connected : styles.notConnected]}>
                  {company.insurance_doc_url ? 'Submitted' : 'Required'}
                </Text>
              </View>
              {setupRoute && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Setup</Text>
                  <TouchableOpacity onPress={() => navigation.navigate(setupRoute)} activeOpacity={0.8}>
                    <Text style={[styles.infoVal, styles.setupLink]}>Continue setup</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={[styles.infoRow, payoutReady && styles.infoRowLast]}>
                <Text style={styles.infoKey}>Stripe</Text>
                <Text style={[styles.infoVal, payoutReady ? styles.connected : styles.notConnected]}>
                  {payoutReady
                    ? 'Payouts active'
                    : company.stripe_account_id
                    ? 'Onboarding incomplete'
                    : 'Not connected'}
                </Text>
              </View>
              {company.stripe_account_id && !payoutReady && company.stripe_onboarding_checked_at ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Last checked</Text>
                  <Text style={styles.infoVal}>
                    {new Date(company.stripe_onboarding_checked_at).toLocaleDateString('en-CA')}
                  </Text>
                </View>
              ) : null}
              {!payoutReady && (
                <View style={[styles.infoRow, styles.infoRowLast]}>
                  <GlassButton
                    label={connectLoading ? 'Opening…' : company.stripe_account_id ? 'Finish payout setup' : 'Set up payouts'}
                    onPress={handleSetupPayouts}
                    loading={connectLoading}
                    fullWidth
                    size="sm"
                    style={styles.payoutButton}
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
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 140 },
  pageTitle: { ...Typography.h1, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  identityBody: { flex: 1 },
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
  infoRowLast: { borderBottomWidth: 0 },
  infoKey: { ...Typography.bodySecondary, flex: 1 },
  infoVal: { ...Typography.body, flex: 2, textAlign: 'right' },
  connected: { color: Colors.success },
  notConnected: { color: Colors.warning },
  setupLink: { color: Colors.accent, fontWeight: '700' },
  continueSetupBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  continueSetupText: { color: Colors.accentFg, fontSize: 12, fontWeight: '700' },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.glass.border,
  },
  menuIcon: { width: 28, alignItems: 'center' as const, justifyContent: 'center' as const },
  menuLabel: { ...Typography.body, flex: 1 },
  signOutBtn: { marginTop: Spacing.sm },
  payoutButton: { marginTop: 4 },
});
