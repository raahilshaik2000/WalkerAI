import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

interface LineItem {
  id: string;
  description: string;
  amount: string; // CAD dollars (string for input)
}

interface MilestoneInput {
  id: string;
  title: string;
  amount: string; // CAD dollars
  due_date: string;
}

function formatTotal(items: LineItem[]): number {
  return items.reduce((s, i) => {
    const n = parseFloat(i.amount);
    return s + (isNaN(n) ? 0 : n);
  }, 0);
}

export default function QuoteBuilderScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: 'Labour', amount: '' },
    { id: '2', description: 'Materials', amount: '' },
  ]);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { id: '1', title: 'Deposit (30%)', amount: '', due_date: '' },
    { id: '2', title: 'Rough-in complete (40%)', amount: '', due_date: '' },
    { id: '3', title: 'Project complete (30%)', amount: '', due_date: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { id: Date.now().toString(), description: '', amount: '' }]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, { id: Date.now().toString(), title: '', amount: '', due_date: '' }]);
  };

  const removeMilestone = (id: string) => {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMilestone = (id: string, field: keyof MilestoneInput, value: string) => {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const isValidDate = (s: string) => {
    if (!s) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s);
    return !isNaN(d.getTime());
  };

  const handleSubmit = async () => {
    const totalDollars = formatTotal(lineItems);
    if (totalDollars <= 0) {
      Alert.alert('Invalid quote', 'Please enter at least one line item with an amount.');
      return;
    }

    const milestonesTotalDollars = formatTotal(milestones as any);
    const diff = Math.abs(milestonesTotalDollars - totalDollars);
    if (diff > 1) {
      Alert.alert(
        'Milestone total mismatch',
        `Milestones total $${milestonesTotalDollars.toFixed(2)} but quote total is $${totalDollars.toFixed(2)}. They should match.`
      );
      return;
    }

    for (const m of milestones) {
      if (!m.title.trim() || !m.amount) {
        Alert.alert('Incomplete milestones', 'Please fill in all milestone titles and amounts.');
        return;
      }
      if (!isValidDate(m.due_date)) {
        Alert.alert('Invalid date', `Milestone "${m.title}" has an invalid due date. Use YYYY-MM-DD format.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Get company
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (!company) throw new Error('Company not found');

      // Create quote
      const totalCents = Math.round(totalDollars * 100);
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          project_id: projectId,
          company_id: company.id,
          total_amount: totalCents,
          notes: notes.trim() || null,
          status: 'pending',
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (quoteError) throw quoteError;

      // Insert milestones
      const milestoneRows = milestones.map((m, i) => ({
        quote_id: quote.id,
        title: m.title.trim(),
        amount: Math.round(parseFloat(m.amount) * 100),
        status: 'pending',
        sort_order: i + 1,
        due_date: m.due_date || null,
      }));

      const { error: msError } = await supabase.from('milestones').insert(milestoneRows);
      if (msError) throw msError;

      // Notify homeowner
      const { data: project } = await supabase
        .from('projects')
        .select('homeowner_id')
        .eq('id', projectId)
        .single();

      if (project) {
        await supabase.from('notifications').insert({
          user_id: project.homeowner_id,
          type: 'quote_submitted',
          payload: {
            project_id: projectId,
            quote_id: quote.id,
            total_amount: totalCents,
            deep_link: `/(homeowner)/project/${projectId}/quote`,
          },
        });
      }

      Alert.alert(
        'Quote submitted!',
        'The homeowner has been notified. You\'ll hear back within 48 hours.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit quote.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalDollars = formatTotal(lineItems);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.title}>Build Quote</Text>
              <View style={{ width: 48 }} />
            </View>

            {/* Line Items */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Line Items</Text>
              {lineItems.map((item) => (
                <View key={item.id} style={styles.lineItemRow}>
                  <TextInput
                    style={[styles.lineDesc, { color: Colors.text.primary }]}
                    value={item.description}
                    onChangeText={(v) => updateLineItem(item.id, 'description', v)}
                    placeholder="Description"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                  <View style={styles.lineAmountWrapper}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={[styles.lineAmount, { color: Colors.text.primary }]}
                      value={item.amount}
                      onChangeText={(v) => updateLineItem(item.id, 'amount', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.text.tertiary}
                    />
                  </View>
                  {lineItems.length > 1 && (
                    <TouchableOpacity onPress={() => removeLineItem(item.id)} style={styles.removeBtn}>
                      <Icon name="close-circle" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={addLineItem} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add line item</Text>
              </TouchableOpacity>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalAmount}>
                  ${totalDollars.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </GlassCard>

            {/* Payment milestones */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Payment Milestones</Text>
              <Text style={styles.sectionSub}>
                Break your quote into milestone payments. Total must equal the quote total.
              </Text>
              {milestones.map((m, i) => (
                <View key={m.id} style={styles.milestoneInput}>
                  <Text style={styles.milestoneNum}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={styles.milestoneTitleRow}>
                      <TextInput
                        style={[styles.milestoneTitle, { flex: 1, color: Colors.text.primary }]}
                        value={m.title}
                        onChangeText={(v) => updateMilestone(m.id, 'title', v)}
                        placeholder="Milestone title"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                      {milestones.length > 1 && (
                        <TouchableOpacity onPress={() => removeMilestone(m.id)} style={styles.removeBtn}>
                          <Icon name="close-circle" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.milestoneAmountRow}>
                      <Text style={styles.dollarSign}>$</Text>
                      <TextInput
                        style={[styles.lineAmount, { flex: 1, color: Colors.text.primary }]}
                        value={m.amount}
                        onChangeText={(v) => updateMilestone(m.id, 'amount', v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                      <TextInput
                        style={[styles.dateInput, { color: Colors.text.primary, borderBottomColor: m.due_date && !isValidDate(m.due_date) ? Colors.error : Colors.glass.border }]}
                        value={m.due_date}
                        onChangeText={(v) => updateMilestone(m.id, 'due_date', v)}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={Colors.text.tertiary}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addMilestone} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add milestone</Text>
              </TouchableOpacity>
            </GlassCard>

            {/* Notes */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Notes for Homeowner</Text>
              <TextInput
                style={[styles.notesInput, { color: Colors.text.primary }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any additional details, assumptions, or terms…"
                placeholderTextColor={Colors.text.tertiary}
                multiline
                numberOfLines={4}
              />
            </GlassCard>

            <GlassButton
              label={`Submit Quote — $${totalDollars.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`}
              onPress={handleSubmit}
              loading={submitting}
              fullWidth
              size="lg"
              haptic
            />
          </ScrollView>
        </KeyboardAvoidingView>
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
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },
  card: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, marginBottom: 8 },
  sectionSub: { ...Typography.caption, marginBottom: 14, lineHeight: 18 },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  lineDesc: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  lineAmountWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
  },
  dollarSign: { color: Colors.text.secondary, fontSize: 15, marginRight: 2 },
  lineAmount: { flex: 1, fontSize: 15, textAlign: 'right' },
  removeBtn: { padding: 4 },
  removeBtnText: { color: Colors.error, fontSize: 14 },
  addBtn: { paddingVertical: 12 },
  addBtnText: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  totalLabel: { ...Typography.label },
  totalAmount: { fontSize: 22, fontWeight: '700', color: Colors.text.primary },
  milestoneInput: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
    marginBottom: 14,
  },
  milestoneNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.accent,
    color: '#fff',
    fontSize: 12, fontWeight: '700',
    textAlign: 'center', lineHeight: 24,
    marginTop: 8,
  },
  milestoneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  milestoneTitle: { fontSize: 14, borderBottomWidth: 1, borderBottomColor: Colors.glass.border, paddingBottom: 4 },
  milestoneAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { fontSize: 13, borderBottomWidth: 1, borderBottomColor: Colors.glass.border, paddingBottom: 2, width: 110 },
  notesInput: {
    fontSize: 14,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    padding: 12,
  },
});
