import { useCallback, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import type { GeneralContractor } from '@/types/database.types';
import { nextGeneralContractorOnboardingRoute } from '@/lib/general-contractor';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import { TradeMetricStrip, TradeScreenHeader } from '@/components/company/TradeUI';

export default function GeneralContractorProfile() {
  const navigation = useNavigation<any>();
  const { user, clearSession } = useAuthStore();
  const [gc, setGc] = useState<GeneralContractor | null>(null);
  const [managedCount, setManagedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [startingPayoutSetup, setStartingPayoutSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view your GC profile.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: profile, error } = await supabase
        .from('general_contractors')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) throw error;
      setGc(profile as GeneralContractor | null);

      if (profile?.id) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('general_contractor_projects')
          .select('status')
          .eq('general_contractor_id', profile.id);
        if (assignmentError) throw assignmentError;
        setManagedCount((assignments ?? []).filter((row) => ['active', 'completed'].includes(row.status)).length);
        setCompletedCount((assignments ?? []).filter((row) => row.status === 'completed').length);
      } else {
        setManagedCount(0);
        setCompletedCount(0);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load GC profile.');
      setGc(null);
      setManagedCount(0);
      setCompletedCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

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

  const handlePayoutSetup = async () => {
    if (!gc) {
      Alert.alert('GC setup required', 'Create your General Contractor profile before setting up payouts.');
      return;
    }
    const incompleteRoute = nextGeneralContractorOnboardingRoute(gc);
    if (incompleteRoute) {
      Alert.alert('Finish GC setup', 'Complete your General Contractor profile before connecting payouts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue Setup', onPress: () => navigation.navigate(incompleteRoute) },
      ]);
      return;
    }

    setStartingPayoutSetup(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: { role: 'general_contractor' },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      const url = typeof data?.url === 'string' ? data.url : null;
      if (!url) throw new Error('Stripe did not return an onboarding link.');
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Could not start payout setup', await formatSupabaseFunctionError(err, 'Please try again.'));
    } finally {
      setStartingPayoutSetup(false);
    }
  };

  const setupRoute = nextGeneralContractorOnboardingRoute(gc);
  const payoutReady = isStripePayoutLocallyReady(gc);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader title="GC Profile" subtitle="Concierge status, margins, and account controls" />

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Profile unavailable</Text>
              <Text style={styles.infoVal}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.infoVal}>Loading profile...</Text>
            </GlassCard>
          ) : !gc ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>GC setup</Text>
              <Text style={styles.infoVal}>Create your General Contractor profile before managing projects.</Text>
              <GlassButton
                label="Start Setup"
                onPress={() => navigation.navigate('GeneralContractorBusinessOnboarding')}
                style={styles.cardButton}
              />
            </GlassCard>
          ) : null}

          <GlassCard style={styles.card}>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {gc?.business_name?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.businessName}>{loading ? 'Loading GC profile...' : gc?.business_name ?? 'General Contractor'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                {!loading && gc?.verified ? (
                  <StatusBadge label="Verified GC" variant="completed" size="sm" dot />
                ) : !loading && setupRoute ? (
                  <TouchableOpacity
                    style={styles.continueSetupBtn}
                    onPress={() => navigation.navigate(setupRoute)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.continueSetupText}>Continue setup</Text>
                  </TouchableOpacity>
                ) : !loading ? (
                  <StatusBadge label="Pending review" variant="pending" size="sm" />
                ) : null}
              </View>
            </View>
          </GlassCard>

          <TradeMetricStrip
            items={[
              { label: 'Managed', value: managedCount, tone: managedCount ? 'success' : 'muted' },
              { label: 'Completed', value: completedCount, tone: completedCount ? 'success' : 'muted' },
              { label: 'Rating', value: gc?.rating != null ? gc.rating.toFixed(1) : 'New', tone: gc?.rating ? 'success' : 'muted' },
            ]}
          />

          {gc ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Business Info</Text>
              <InfoRow label="Location" value={[gc.city, gc.province].filter(Boolean).join(', ') || 'Not set'} />
              <InfoRow label="Service radius" value={`${gc.service_radius_km} km`} />
              <InfoRow label="License" value={gc.license_number ?? 'Required'} warning={!gc.license_number} />
              <InfoRow label="License document" value={gc.license_doc_url ? 'Submitted' : 'Required'} warning={!gc.license_doc_url} />
              <InfoRow label="Insurance" value={gc.insurance_doc_url ? 'Submitted' : 'Required'} warning={!gc.insurance_doc_url} />
              <InfoRow label="Concierge" value={gc.concierge_enabled ? 'Enabled' : 'Disabled'} />
              <InfoRow
                label="Payouts"
                value={payoutReady ? 'Ready' : gc.stripe_account_id ? 'Onboarding incomplete' : 'Not connected'}
                warning={!payoutReady}
              />
              {setupRoute ? (
                <TouchableOpacity style={styles.setupLinkRow} onPress={() => navigation.navigate(setupRoute)} activeOpacity={0.8}>
                  <Text style={styles.setupLinkText}>Continue GC setup</Text>
                  <Icon name="chevron-right" size={20} color={Colors.accent} />
                </TouchableOpacity>
              ) : null}
              {!setupRoute ? (
                <GlassButton
                  label="Edit Business Info"
                  onPress={() => navigation.navigate('GeneralContractorBusinessOnboarding', { returnToProfile: true })}
                  fullWidth
                  size="sm"
                  variant="secondary"
                  style={styles.cardButton}
                />
              ) : null}
              {!setupRoute ? (
                <GlassButton
                  label={payoutReady ? 'Refresh Payout Setup' : 'Set Up Payouts'}
                  onPress={handlePayoutSetup}
                  loading={startingPayoutSetup}
                  fullWidth
                  size="sm"
                  style={styles.cardButton}
                />
              ) : null}
            </GlassCard>
          ) : null}

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

function InfoRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{label}</Text>
      <Text style={[styles.infoVal, warning && styles.warning]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 140 },
  card: { marginBottom: Spacing.sm },
  cardButton: { marginTop: Spacing.sm },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  identityBody: { flex: 1 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.accent, fontSize: 22, fontWeight: '700' },
  businessName: { ...Typography.h3, marginBottom: 2 },
  email: { ...Typography.caption, marginBottom: 8 },
  continueSetupBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  continueSetupText: { color: Colors.accentFg, fontSize: 12, fontWeight: '700' },
  sectionLabel: { ...Typography.label, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  infoKey: { ...Typography.bodySecondary, flex: 1 },
  infoVal: { ...Typography.body, flex: 2, textAlign: 'right' },
  warning: { color: Colors.warning },
  setupLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 12 },
  setupLinkText: { color: Colors.accent, fontWeight: '700' },
  signOutBtn: { marginTop: Spacing.sm },
});
