import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatSignedCadCents, parseSignedCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';
import type { ChangeOrder } from '@/types/database.types';

const CHANGE_ORDER_SELECT_WITH_COMPANY =
  'id, project_id, company_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at';

const CHANGE_ORDER_SELECT_LEGACY =
  'id, project_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at';

function isMissingChangeOrderCompanyColumn(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /column .*company_id.* does not exist/i.test(message)
    || /change_orders.*company_id/i.test(message)
    || /schema cache/i.test(message);
}

function normalizeLegacyChangeOrders(data: Array<Omit<ChangeOrder, 'company_id'>> | null): ChangeOrder[] {
  return (data ?? []).map((changeOrder) => ({
    ...changeOrder,
    company_id: null,
  }));
}

function statusVariant(status: string): 'pending' | 'active' | 'completed' | 'error' {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'error';
  return 'pending';
}

export default function CompanyChangeOrdersScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearChangeOrderState = useCallback(() => {
    setChangeOrders([]);
    setCompanyId(null);
    setShowForm(false);
    setDescription('');
    setCostDelta('');
  }, []);

  const fetchChangeOrders = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    if (!projectId || !user?.id) {
      setErrorMessage('Project is missing. Reopen change orders from the job page.');
      clearChangeOrderState();
      setLoading(false);
      return;
    }

    try {
      const companyResult = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyResult.error) {
        setErrorMessage(formatAppSafeErrorMessage(companyResult.error, 'Could not load company profile.'));
        clearChangeOrderState();
        setLoading(false);
        return;
      }
      const currentCompanyId = companyResult.data?.id ?? null;
      setCompanyId(currentCompanyId);

      if (!currentCompanyId) {
        setErrorMessage('Complete contractor onboarding before viewing change orders for this job.');
        clearChangeOrderState();
        setLoading(false);
        return;
      }

      const changeOrdersResult = await supabase
        .from('change_orders')
        .select(CHANGE_ORDER_SELECT_WITH_COMPANY)
        .eq('project_id', projectId)
        .or(`company_id.eq.${currentCompanyId},company_id.is.null`)
        .order('created_at', { ascending: false });

      const { data, error } = changeOrdersResult;
      if (error) {
        if (isMissingChangeOrderCompanyColumn(error)) {
          const legacyResult = await supabase
            .from('change_orders')
            .select(CHANGE_ORDER_SELECT_LEGACY)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

          if (legacyResult.error) {
            setErrorMessage(formatAppSafeErrorMessage(legacyResult.error, 'Could not load change orders.'));
            clearChangeOrderState();
            setLoading(false);
            return;
          }

          setErrorMessage(null);
          setChangeOrders(normalizeLegacyChangeOrders(legacyResult.data as Array<Omit<ChangeOrder, 'company_id'>> | null));
          setLoading(false);
          return;
        }

        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load change orders.'));
        clearChangeOrderState();
        setLoading(false);
        return;
      }
      setErrorMessage(null);
      setChangeOrders((data ?? []) as ChangeOrder[]);
      setLoading(false);
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load change orders.'));
      clearChangeOrderState();
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [clearChangeOrderState, projectId, user?.id]);

  useEffect(() => {
    fetchChangeOrders();
    if (!projectId) return;

    const channel = supabase
      .channel(`company-change-orders:${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'change_orders',
        filter: `project_id=eq.${projectId}`,
      }, () => fetchChangeOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchChangeOrders, projectId]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe the change.');
      return;
    }

    if (!projectId) {
      Alert.alert('Missing project', 'Please reopen this job and try again.');
      return;
    }

    if (!companyId) {
      Alert.alert('Company profile missing', 'Complete contractor onboarding before proposing a change order.');
      return;
    }

    let deltaCents: number | null = null;
    if (costDelta.trim()) {
      const parsedDelta = parseSignedCadToCents(costDelta);
      if (parsedDelta == null) {
        Alert.alert('Invalid cost adjustment', 'Enter a valid CAD amount, such as +500, -200, or 125.50.');
        return;
      }
      deltaCents = parsedDelta;
    }

    setSubmitting(true);
    const changeOrderPayload = {
      project_id: projectId,
      company_id: companyId,
      description: description.trim(),
      cost_delta: deltaCents,
      status: 'proposed',
      signed_by_company: true,
      signed_by_homeowner: false,
    };

    try {
      const insertResult = await supabase.from('change_orders').insert(changeOrderPayload);
      let insertError = insertResult.error;

      if (isMissingChangeOrderCompanyColumn(insertError)) {
        const legacyPayload = {
          project_id: changeOrderPayload.project_id,
          description: changeOrderPayload.description,
          cost_delta: changeOrderPayload.cost_delta,
          status: changeOrderPayload.status,
          signed_by_company: changeOrderPayload.signed_by_company,
          signed_by_homeowner: changeOrderPayload.signed_by_homeowner,
        };
        const legacyInsertResult = await supabase.from('change_orders').insert(legacyPayload);
        insertError = legacyInsertResult.error;
      }

      if (insertError) {
        Alert.alert('Could not submit change order', formatAppSafeErrorMessage(insertError, 'Please try again.'));
      } else {
        ReactNativeHapticFeedback.trigger('notificationSuccess');
        setDescription('');
        setCostDelta('');
        setShowForm(false);
        fetchChangeOrders();
      }
    } catch (err) {
      Alert.alert('Could not submit change order', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSign = async (co: ChangeOrder) => {
    if (co.company_id && companyId && co.company_id !== companyId) {
      Alert.alert('Not available', 'This change order belongs to another contractor.');
      return;
    }

    Alert.alert(
      'Sign change order',
      'Confirm your digital signature for this change order.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign',
          onPress: async () => {
            try {
              const { data, error } = await supabase.from('change_orders')
                .update({
                  signed_by_company: true,
                  status: co.signed_by_homeowner ? 'approved' : 'proposed',
                })
                .eq('id', co.id)
                .select('id')
                .maybeSingle();
              if (error) {
                Alert.alert('Could not sign change order', formatAppSafeErrorMessage(error, 'Please try again.'));
              } else if (!data) {
                Alert.alert('Change order unavailable', 'This change order is no longer available.');
              } else {
                ReactNativeHapticFeedback.trigger('notificationSuccess');
                fetchChangeOrders();
              }
            } catch (err) {
              Alert.alert('Could not sign change order', formatAppSafeErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ]
    );
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Change Orders</Text>
            <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
              <Text style={styles.addBtn}>{showForm ? 'Cancel' : '+ New'}</Text>
            </TouchableOpacity>
          </View>

          {/* New change order form */}
          {showForm && (
            <GlassCard style={styles.formCard}>
              <Text style={styles.sectionLabel}>Propose Change Order</Text>
              <GlassInput
                label="Description"
                value={description}
                onChangeText={setDescription}
                containerStyle={styles.inputGap}
              />
              <GlassInput
                label="Cost adjustment (optional, e.g. +500 or -200)"
                value={costDelta}
                onChangeText={setCostDelta}
                keyboardType="numbers-and-punctuation"
                containerStyle={styles.inputGap}
              />
              <Text style={styles.signNote}>
                <Icon name="draw" size={14} color={Colors.text.secondary} /> Submitting counts as your digital signature. Cost changes are documented here, but funded escrow and milestone payments are not updated automatically.
              </Text>
              <GlassButton
                label="Submit Change Order"
                onPress={handleSubmit}
                loading={submitting}
                fullWidth
                haptic
                style={{ marginTop: Spacing.sm }}
              />
            </GlassCard>
          )}

          {/* Change order list */}
          {loading ? (
            <View style={styles.center}>
                <Text style={Typography.bodySecondary}>Loading…</Text>
              </View>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Icon name="alert-circle-outline" size={48} color={Colors.error} />
              <Text style={styles.emptyTitle}>Could not load change orders</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
              <GlassButton label="Try Again" onPress={fetchChangeOrders} style={{ marginTop: Spacing.md }} />
            </View>
          ) : changeOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="file-edit-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No change orders</Text>
              <Text style={styles.emptySub}>
                Use change orders to document scope changes and get homeowner sign-off.
              </Text>
            </View>
          ) : (
            changeOrders.map((co) => (
              <GlassCard key={co.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <StatusBadge label={formatStatusLabel(co.status)} variant={statusVariant(co.status)} />
                  <Text style={styles.orderDate}>
                    {new Date(co.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>

                <Text style={styles.orderDesc}>{co.description}</Text>

                {co.cost_delta !== null && (
                  <View style={styles.costBlock}>
                    <Text style={[
                      styles.costDelta,
                      co.cost_delta >= 0 ? styles.costPos : styles.costNeg,
                    ]}>
                      {formatSignedCadCents(co.cost_delta)} CAD
                    </Text>
                    <Text style={styles.costHint}>Documented only; escrow is not adjusted automatically.</Text>
                  </View>
                )}

                <View style={styles.sigRow}>
                  <View style={[styles.sigBadge, co.signed_by_company && styles.sigBadgeSigned]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {co.signed_by_company
                        ? <Icon name="check-circle" size={14} color={Colors.success} />
                        : <Icon name="circle-outline" size={14} color={Colors.text.tertiary} />}
                      <Text style={styles.sigText}>Your signature</Text>
                    </View>
                  </View>
                  <View style={[styles.sigBadge, co.signed_by_homeowner && styles.sigBadgeSigned]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {co.signed_by_homeowner
                        ? <Icon name="check-circle" size={14} color={Colors.success} />
                        : <Icon name="circle-outline" size={14} color={Colors.text.tertiary} />}
                      <Text style={styles.sigText}>Homeowner</Text>
                    </View>
                  </View>
                </View>

                {co.status === 'proposed' && !co.signed_by_company && (
                  <GlassButton
                    label="Sign Change Order"
                    onPress={() => handleSign(co)}
                    size="sm"
                    haptic
                    style={{ marginTop: 12 }}
                  />
                )}

                {co.status === 'approved' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    <Icon name="check-circle" size={14} color={Colors.success} />
                    <Text style={styles.approvedNote}>Both parties signed — change is approved</Text>
                  </View>
                )}
              </GlassCard>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h2 },
  addBtn: { color: Colors.accent, fontSize: 15, fontWeight: '600' },
  formCard: { marginBottom: Spacing.sm },
  sectionLabel: { ...Typography.label, marginBottom: 12 },
  inputGap: { marginBottom: 12 },
  signNote: { ...Typography.caption, lineHeight: 18, marginTop: 4 },
  orderCard: { marginBottom: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderDate: { ...Typography.caption },
  orderDesc: { ...Typography.body, marginBottom: 8, lineHeight: 22 },
  costBlock: { marginBottom: 12 },
  costDelta: { fontSize: 18, fontWeight: '700' },
  costHint: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },
  costPos: { color: Colors.warning },
  costNeg: { color: Colors.success },
  sigRow: { flexDirection: 'row', gap: 8 },
  sigBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
  },
  sigBadgeSigned: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  sigText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600' },
  approvedNote: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
