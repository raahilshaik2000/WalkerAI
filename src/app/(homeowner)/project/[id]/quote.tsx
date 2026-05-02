import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase/client';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';

interface ProjectData {
  ai_cost_min: number;
  ai_cost_max: number;
  status: string;
  room_type: string;
  ai_analysis: any;
}

interface Milestone {
  title: string;
  amount: number;
  sort_order: number;
  status: string;
}

interface LineItem {
  id: string;
  type: 'labour' | 'material' | 'other';
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  sort_order: number | null;
}

interface Quote {
  id: string;
  total_amount: number;
  status: string;
  milestones: Milestone[];
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

const MILESTONE_COLORS = ['#FF6B00', '#60A5FA', '#34D399'];

export default function CostBreakdownScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [labourExpanded, setLabourExpanded] = useState(false);
  const [materialsExpanded, setMaterialsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const fetchData = async () => {
    const [{ data: proj }, { data: q }] = await Promise.all([
      supabase
        .from('projects')
        .select('ai_cost_min, ai_cost_max, status, room_type, ai_analysis')
        .eq('id', projectId)
        .single(),
      supabase
        .from('quotes')
        .select('id, total_amount, status, milestones ( title, amount, sort_order, status )')
        .eq('project_id', projectId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setProject(proj as any);
    setQuote(q as any);

    // Fetch line items if quote exists
    if (q?.id) {
      const { data: items } = await supabase
        .from('quote_line_items')
        .select('id, type, description, quantity, unit, unit_cost, total_cost, sort_order')
        .eq('quote_id', q.id)
        .order('sort_order', { ascending: true });
      setLineItems((items as LineItem[]) ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const handlePay = async () => {
    if (!quote) return;
    Alert.alert(
      'Confirm Payment',
      `Pay ${formatCad(quote.total_amount)} to start your project? Funds are held in escrow and released milestone by milestone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPaying(true);
            try {
              const { data, error } = await supabase.functions.invoke('create-payment-intent', {
                body: { project_id: projectId },
              });
              if (error) throw error;

              const { error: initErr } = await initPaymentSheet({
                paymentIntentClientSecret: data.client_secret,
                merchantDisplayName: 'WalkerAI',
              });
              if (initErr) throw new Error(initErr.message);

              const { error: payErr } = await presentPaymentSheet();
              if (payErr) {
                if (payErr.code !== 'Canceled') throw new Error(payErr.message);
                return;
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              setTimeout(() => fetchData(), 1500);
              Alert.alert(
                'Payment received!',
                'Your project is now active. Funds are held in escrow and released as milestones are completed.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.bodySecondary}>Loading…</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const milestones = [...(quote?.milestones ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const totalAmount = quote?.total_amount ?? project?.ai_cost_min ?? 0;
  const isAccepted = project?.status === 'accepted';
  const isPaid = quote?.status === 'approved' || project?.status === 'active';
  const scopeItems: Array<{ phase: string; description: string }> = project?.ai_analysis?.scope_of_work ?? [];

  const labourItems = lineItems.filter((li) => li.type === 'labour');
  const materialItems = lineItems.filter((li) => li.type === 'material');
  const otherItems = lineItems.filter((li) => li.type === 'other');

  function toggleLabour() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLabourExpanded((v) => !v);
  }

  function toggleMaterials() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMaterialsExpanded((v) => !v);
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cost Breakdown</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* AI Price Card */}
          <GlassCard style={styles.card}>
            <View style={styles.priceHeader}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,107,0,0.12)' }]}>
                <Ionicons name="sparkles" size={20} color="#FF6B00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.priceLabel}>Walker AI Fixed Price</Text>
                <Text style={styles.priceSubLabel}>Set by AI · confirmed by your contractor</Text>
              </View>
            </View>
            <Text style={styles.priceRange}>
              {project?.ai_cost_min && project?.ai_cost_max
                ? `${formatCad(project.ai_cost_min)} – ${formatCad(project.ai_cost_max)}`
                : totalAmount > 0
                ? formatCad(totalAmount)
                : '—'}
            </Text>
            {quote?.total_amount ? (
              <View style={styles.confirmedRow}>
                <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                <Text style={styles.confirmedText}>
                  Contractor confirmed at {formatCad(quote.total_amount)}
                </Text>
              </View>
            ) : (
              <Text style={styles.pendingText}>Waiting for a contractor to accept this project</Text>
            )}
          </GlassCard>

          {/* Line Items — Labour & Materials */}
          {lineItems.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Cost Breakdown</Text>

              {/* Labour */}
              {labourItems.length > 0 && (
                <>
                  <TouchableOpacity style={styles.lineSection} onPress={toggleLabour} activeOpacity={0.7}>
                    <View style={styles.lineSectionLeft}>
                      <Ionicons name="hammer-outline" size={16} color="#60A5FA" />
                      <Text style={styles.lineSectionTitle}>Labour</Text>
                      <View style={styles.lineCount}>
                        <Text style={styles.lineCountText}>{labourItems.length}</Text>
                      </View>
                    </View>
                    <View style={styles.lineSectionRight}>
                      {labourItems.some((li) => li.total_cost) && (
                        <Text style={styles.lineSectionTotal}>
                          {formatCad(labourItems.reduce((s, li) => s + (li.total_cost ?? 0), 0))}
                        </Text>
                      )}
                      <Ionicons name={labourExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.tertiary} />
                    </View>
                  </TouchableOpacity>

                  {labourExpanded && labourItems.map((li, i) => (
                    <View key={li.id} style={[styles.lineRow, i < labourItems.length - 1 && styles.lineRowBorder]}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      <View style={styles.lineRight}>
                        {li.quantity !== 1 || li.unit ? (
                          <Text style={styles.lineQty}>{li.quantity}{li.unit ? ` ${li.unit}` : ''}</Text>
                        ) : null}
                        {li.total_cost ? (
                          <Text style={styles.lineTotal}>{formatCad(li.total_cost)}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Materials */}
              {materialItems.length > 0 && (
                <>
                  <View style={[styles.lineDivider, labourItems.length > 0 && { marginTop: 2 }]} />
                  <TouchableOpacity style={styles.lineSection} onPress={toggleMaterials} activeOpacity={0.7}>
                    <View style={styles.lineSectionLeft}>
                      <Ionicons name="cube-outline" size={16} color="#A78BFA" />
                      <Text style={styles.lineSectionTitle}>Materials</Text>
                      <View style={[styles.lineCount, { backgroundColor: 'rgba(167,139,250,0.15)' }]}>
                        <Text style={[styles.lineCountText, { color: '#A78BFA' }]}>{materialItems.length}</Text>
                      </View>
                    </View>
                    <View style={styles.lineSectionRight}>
                      {materialItems.some((li) => li.total_cost) && (
                        <Text style={styles.lineSectionTotal}>
                          {formatCad(materialItems.reduce((s, li) => s + (li.total_cost ?? 0), 0))}
                        </Text>
                      )}
                      <Ionicons name={materialsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.tertiary} />
                    </View>
                  </TouchableOpacity>

                  {materialsExpanded && materialItems.map((li, i) => (
                    <View key={li.id} style={[styles.lineRow, i < materialItems.length - 1 && styles.lineRowBorder]}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      <View style={styles.lineRight}>
                        {li.quantity !== 1 || li.unit ? (
                          <Text style={styles.lineQty}>{li.quantity}{li.unit ? ` ${li.unit}` : ''}</Text>
                        ) : null}
                        {li.total_cost ? (
                          <Text style={styles.lineTotal}>{formatCad(li.total_cost)}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </GlassCard>
          )}

          {/* Milestone Payment Schedule */}
          {milestones.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Payment Schedule</Text>
              <Text style={styles.sectionSub}>Funds held in escrow — released after each milestone is approved</Text>
              {milestones.map((m, i) => (
                <View key={i} style={[styles.milestoneRow, i < milestones.length - 1 && styles.milestoneRowBorder]}>
                  <View style={[styles.milestoneNum, { backgroundColor: MILESTONE_COLORS[i % 3] + '18', borderColor: MILESTONE_COLORS[i % 3] + '60' }]}>
                    <Text style={[styles.milestoneNumText, { color: MILESTONE_COLORS[i % 3] }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneTitle}>{m.title}</Text>
                    <Text style={styles.milestonePct}>
                      {quote?.total_amount ? `${Math.round((m.amount / quote.total_amount) * 100)}% of total` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.milestoneAmount}>{formatCad(m.amount)}</Text>
                    {m.status === 'released' && (
                      <Text style={styles.releasedBadge}>Released</Text>
                    )}
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* No milestone yet placeholder */}
          {milestones.length === 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Payment Schedule</Text>
              <View style={styles.placeholderRow}>
                {[
                  { label: 'Project Deposit', pct: '30%' },
                  { label: 'Mid-Project', pct: '30%' },
                  { label: 'Final Completion', pct: '40%' },
                ].map((item, i) => (
                  <View key={i} style={[styles.milestoneRow, i < 2 && styles.milestoneRowBorder]}>
                    <View style={[styles.milestoneNum, { backgroundColor: MILESTONE_COLORS[i] + '18', borderColor: MILESTONE_COLORS[i] + '60' }]}>
                      <Text style={[styles.milestoneNumText, { color: MILESTONE_COLORS[i] }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.milestoneTitle}>{item.label}</Text>
                      <Text style={styles.milestonePct}>{item.pct} of total</Text>
                    </View>
                    <Text style={styles.milestoneAmountDim}>—</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.pendingNote}>Exact amounts confirmed once a contractor accepts</Text>
            </GlassCard>
          )}

          {/* What's Included */}
          {scopeItems.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>What's Included</Text>
              {scopeItems.map((s: any, i: number) => (
                <View key={i} style={[styles.scopeRow, i < scopeItems.length - 1 && styles.milestoneRowBorder]}>
                  <View style={styles.phasePill}>
                    <Text style={styles.phaseText}>{s.phase}</Text>
                  </View>
                  <Text style={styles.scopeDesc}>{s.description}</Text>
                </View>
              ))}
            </GlassCard>
          )}

          {/* How Escrow Works */}
          <GlassCard style={styles.card}>
            <Text style={styles.sectionLabel}>How Escrow Works</Text>
            {[
              { icon: 'lock-closed-outline', text: "You pay the full amount upfront — it's held securely, not released to the contractor yet." },
              { icon: 'hammer-outline', text: 'As each milestone is completed, you review and approve releasing that payment.' },
              { icon: 'shield-checkmark-outline', text: 'You\'re always in control. No milestone gets paid without your approval.' },
            ].map((item, i) => (
              <View key={i} style={[styles.escrowRow, i < 2 && { marginBottom: 14 }]}>
                <View style={styles.escrowIconWrap}>
                  <Ionicons name={item.icon} size={18} color="#FF6B00" />
                </View>
                <Text style={styles.escrowText}>{item.text}</Text>
              </View>
            ))}
          </GlassCard>

          {/* Pay CTA */}
          {isAccepted && !isPaid && quote && (
            <TouchableOpacity style={styles.payCta} onPress={handlePay} activeOpacity={0.85} disabled={paying}>
              <Ionicons name="card-outline" size={20} color="#000" />
              <Text style={styles.payCtaText}>
                {paying ? 'Processing…' : `Pay ${formatCad(quote.total_amount)} to Start`}
              </Text>
            </TouchableOpacity>
          )}

          {isPaid && (
            <View style={styles.paidBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.paidBannerText}>Payment received — project is active</Text>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 48 },
  card: { marginBottom: Spacing.sm },

  // Price card
  priceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  priceLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  priceSubLabel: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  priceRange: { fontSize: 30, fontWeight: '800', color: '#FF6B00', letterSpacing: -0.5, marginBottom: 10 },
  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 13, color: '#34D399', fontWeight: '600' },
  pendingText: { fontSize: 13, color: Colors.text.tertiary, fontStyle: 'italic' },

  // Milestones
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionSub: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 14, lineHeight: 16 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  milestoneRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  milestoneNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  milestoneNumText: { fontSize: 12, fontWeight: '700' },
  milestoneTitle: { fontSize: 14, fontWeight: '600', color: Colors.text.primary, marginBottom: 2 },
  milestonePct: { fontSize: 12, color: Colors.text.tertiary },
  milestoneAmount: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  milestoneAmountDim: { fontSize: 16, fontWeight: '600', color: Colors.text.tertiary },
  releasedBadge: { fontSize: 11, color: '#34D399', fontWeight: '600', marginTop: 2 },
  placeholderRow: {},
  pendingNote: { fontSize: 12, color: Colors.text.tertiary, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },

  // Scope
  scopeRow: { paddingVertical: 11, gap: 8 },
  phasePill: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,107,0,0.12)',
    borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)',
  },
  phaseText: { fontSize: 11, fontWeight: '700', color: '#FF6B00', textTransform: 'capitalize' },
  scopeDesc: { fontSize: 14, color: Colors.text.secondary, lineHeight: 20 },

  // Escrow
  escrowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  escrowIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,107,0,0.08)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  escrowText: { flex: 1, fontSize: 13, color: Colors.text.secondary, lineHeight: 19 },

  // Pay CTA
  payCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FF6B00', borderRadius: Radius.card, paddingVertical: 16,
    marginTop: 4, marginBottom: Spacing.sm,
  },
  payCtaText: { fontSize: 16, fontWeight: '700', color: '#000' },

  paidBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
    borderRadius: Radius.card, paddingVertical: 14, marginTop: 4,
  },
  paidBannerText: { fontSize: 14, fontWeight: '600', color: '#34D399' },

  // Line items
  lineSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  lineSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineSectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  lineCount: {
    backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  lineCountText: { fontSize: 11, fontWeight: '700', color: '#60A5FA' },
  lineSectionRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineSectionTotal: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  lineDivider: { height: 1, backgroundColor: Colors.glass.border, marginVertical: 2 },
  lineRow: { paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingLeft: 24 },
  lineRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  lineDesc: { fontSize: 13, color: Colors.text.secondary, flex: 1, lineHeight: 18 },
  lineRight: { alignItems: 'flex-end', marginLeft: 12 },
  lineQty: { fontSize: 11, color: Colors.text.tertiary },
  lineTotal: { fontSize: 13, fontWeight: '600', color: Colors.text.primary },
});
