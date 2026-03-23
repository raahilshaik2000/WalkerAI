import { useEffect, useState } from 'react';
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
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';

interface ChangeOrder {
  id: string;
  description: string;
  cost_delta: number | null;
  status: string;
  signed_by_homeowner: boolean;
  signed_by_company: boolean;
  created_at: string;
}

function formatCad(cents: number) {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(abs / 100);
  return cents < 0 ? `-${formatted}` : `+${formatted}`;
}

function statusVariant(status: string): 'pending' | 'active' | 'completed' | 'error' {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'error';
  return 'pending';
}

export default function CompanyChangeOrdersScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchChangeOrders = async () => {
    const { data } = await supabase
      .from('change_orders')
      .select('id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setChangeOrders((data ?? []) as ChangeOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchChangeOrders();

    const channel = supabase
      .channel(`company-change-orders:${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'change_orders',
        filter: `project_id=eq.${projectId}`,
      }, () => fetchChangeOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe the change.');
      return;
    }

    const deltaCents = costDelta.trim()
      ? Math.round(parseFloat(costDelta.replace(/[^0-9.-]/g, '')) * 100)
      : null;

    setSubmitting(true);
    const { error } = await supabase.from('change_orders').insert({
      project_id: projectId,
      description: description.trim(),
      cost_delta: deltaCents,
      status: 'proposed',
      signed_by_company: true,
      signed_by_homeowner: false,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setDescription('');
      setCostDelta('');
      setShowForm(false);
      fetchChangeOrders();
    }
    setSubmitting(false);
  };

  const handleSign = async (co: ChangeOrder) => {
    Alert.alert(
      'Sign change order',
      'Confirm your digital signature for this change order.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign',
          onPress: async () => {
            await supabase.from('change_orders')
              .update({ signed_by_company: true })
              .eq('id', co.id);
            ReactNativeHapticFeedback.trigger('notificationSuccess');
            fetchChangeOrders();
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
              <Text style={styles.backText}>← Back</Text>
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
                ✏️ Submitting counts as your digital signature. Both parties must sign before work begins.
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
          ) : changeOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No change orders</Text>
              <Text style={styles.emptySub}>
                Use change orders to document scope changes and get homeowner sign-off.
              </Text>
            </View>
          ) : (
            changeOrders.map((co) => (
              <GlassCard key={co.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <StatusBadge label={co.status} variant={statusVariant(co.status)} />
                  <Text style={styles.orderDate}>
                    {new Date(co.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>

                <Text style={styles.orderDesc}>{co.description}</Text>

                {co.cost_delta !== null && (
                  <Text style={[
                    styles.costDelta,
                    co.cost_delta >= 0 ? styles.costPos : styles.costNeg,
                  ]}>
                    {formatCad(co.cost_delta)} CAD
                  </Text>
                )}

                <View style={styles.sigRow}>
                  <View style={[styles.sigBadge, co.signed_by_company && styles.sigBadgeSigned]}>
                    <Text style={styles.sigText}>
                      {co.signed_by_company ? '✓' : '○'} Your signature
                    </Text>
                  </View>
                  <View style={[styles.sigBadge, co.signed_by_homeowner && styles.sigBadgeSigned]}>
                    <Text style={styles.sigText}>
                      {co.signed_by_homeowner ? '✓' : '○'} Homeowner
                    </Text>
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
                  <Text style={styles.approvedNote}>✓ Both parties signed — change is approved</Text>
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
  costDelta: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
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
  approvedNote: { marginTop: 10, color: Colors.success, fontSize: 13, fontWeight: '600' },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
