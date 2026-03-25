import { useEffect, useState } from 'react';
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
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase/client';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface Quote {
  id: string;
  total_amount: number;
  status: string;
  submitted_at: string;
  company: { name: string; rating: number };
  milestones: Array<{ title: string; amount: number; due_date: string | null }>;
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default function QuoteScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      const { data } = await supabase
        .from('quotes')
        .select(`
          id, total_amount, status, submitted_at,
          company:companies ( name, rating ),
          milestones ( title, amount, due_date, sort_order )
        `)
        .eq('project_id', projectId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single();
      setQuote(data as unknown as Quote);
      setLoading(false);
    };
    fetchQuote();
  }, [projectId]);

  const handleApprove = async () => {
    if (!quote) return;

    Alert.alert(
      'Approve quote?',
      `This will start the payment process for ${formatCad(quote.total_amount)}. Funds are held in escrow and released milestone by milestone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Pay',
          onPress: async () => {
            setApproving(true);
            try {
              // Create payment intent
              const { data, error } = await supabase.functions.invoke('create-payment-intent', {
                body: { quote_id: quote.id },
              });
              if (error) throw error;

              // Init Stripe payment sheet
              const { error: initError } = await initPaymentSheet({
                paymentIntentClientSecret: data.client_secret,
                merchantDisplayName: 'WalkerAI',
                defaultBillingDetails: {},
              });
              if (initError) throw new Error(initError.message);

              // Present payment sheet
              const { error: paymentError } = await presentPaymentSheet();
              if (paymentError) {
                if (paymentError.code !== 'Canceled') {
                  throw new Error(paymentError.message);
                }
                return; // User cancelled
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              Alert.alert(
                'Payment received!',
                'Your project is now active. Funds are held in escrow and released as milestones are approved.',
                [{ text: 'View Project', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
            } finally {
              setApproving(false);
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
            <Text style={Typography.bodySecondary}>Loading quote…</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!quote) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={Typography.h3}>No quote yet</Text>
            <Text style={Typography.bodySecondary}>Your contractor hasn't submitted a quote yet.</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const isApproved = quote.status === 'approved';
  const milestones = [...(quote.milestones ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Quote</Text>
            <StatusBadge label={quote.status} variant={isApproved ? 'completed' : 'pending'} />
          </View>

          {/* Contractor */}
          <GlassCard style={styles.card}>
            <Text style={styles.sectionLabel}>From Contractor</Text>
            <Text style={styles.companyName}>{quote.company?.name ?? 'Your Contractor'}</Text>
            {quote.company?.rating && (
              <Text style={styles.companyRating}>⭐ {quote.company.rating.toFixed(1)}</Text>
            )}
          </GlassCard>

          {/* Total */}
          <GlassCard style={styles.card}>
            <Text style={styles.sectionLabel}>Total Project Cost</Text>
            <Text style={styles.totalAmount}>{formatCad(quote.total_amount)}</Text>
            <Text style={styles.escrowNote}>
              Held in escrow — you control when each milestone is paid
            </Text>
          </GlassCard>

          {/* Milestones */}
          <GlassCard style={styles.card}>
            <Text style={styles.sectionLabel}>Payment Milestones</Text>
            {milestones.map((m: any, i) => (
              <View key={i} style={[styles.milestoneRow, i < milestones.length - 1 && styles.milestoneRowBorder]}>
                <View style={styles.milestoneNum}>
                  <Text style={styles.milestoneNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.milestoneTitle}>{m.title}</Text>
                  {m.due_date && (
                    <Text style={styles.milestoneDue}>
                      Due {new Date(m.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                </View>
                <Text style={styles.milestoneAmount}>{formatCad(m.amount)}</Text>
              </View>
            ))}
          </GlassCard>

          {!isApproved && (
            <GlassButton
              label={`Approve & Pay ${formatCad(quote.total_amount)}`}
              onPress={handleApprove}
              loading={approving}
              fullWidth
              size="lg"
              haptic
              style={styles.approveCta}
            />
          )}

          {isApproved && (
            <GlassCard style={styles.approvedCard}>
              <Text style={styles.approvedText}>✓ Quote approved — project is active</Text>
            </GlassCard>
          )}

          <Text style={styles.disclaimer}>
            Funds are held securely in escrow. You release each payment only after approving the corresponding milestone.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },
  card: { marginBottom: Spacing.sm },
  sectionLabel: { ...Typography.label, marginBottom: 10 },
  companyName: { ...Typography.h3, marginBottom: 4 },
  companyRating: { ...Typography.caption },
  totalAmount: { fontSize: 36, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.5, marginBottom: 8 },
  escrowNote: { ...Typography.caption, lineHeight: 18 },
  milestoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
  },
  milestoneRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  milestoneNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  milestoneNumText: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
  milestoneTitle: { ...Typography.body, marginBottom: 2 },
  milestoneDue: { ...Typography.caption },
  milestoneAmount: { fontSize: 16, fontWeight: '600', color: Colors.text.primary },
  approveCta: { marginBottom: Spacing.sm },
  approvedCard: { alignItems: 'center', marginBottom: Spacing.sm },
  approvedText: { color: Colors.success, fontWeight: '600', fontSize: 15 },
  disclaimer: { ...Typography.caption, textAlign: 'center', paddingHorizontal: Spacing.sm, lineHeight: 18 },
  emptyIcon: { fontSize: 48 },
});
