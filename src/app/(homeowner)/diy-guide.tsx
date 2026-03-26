import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useDIYWizardStore } from '@/stores/diy-wizard.store';
import { GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

type Tab = 'steps' | 'materials';

export default function DIYGuideScreen() {
  const navigation = useNavigation<any>();
  const store = useDIYWizardStore();
  const guide = store.guide!;
  const [tab, setTab] = useState<Tab>('steps');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [converting, setConverting] = useState(false);

  const handleSave = async () => {
    if (saved) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ diy_guide: guide, status: 'diy_saved' })
        .eq('id', store.projectId!);
      if (error) throw error;
      setSaved(true);
      Alert.alert('Saved!', 'Your DIY guide has been saved to My Projects.', [
        { text: 'View Projects', onPress: () => { store.reset(); navigation.navigate('HomeownerTabs', { screen: 'Projects' }); } },
        { text: 'Stay Here', style: 'cancel' },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save guide.');
    } finally {
      setSaving(false);
    }
  };

  const handleGetProHelp = () => {
    Alert.alert(
      'Get Professional Help',
      "We'll convert this into a contractor project so you can get quotes. Your DIY guide will still be saved for reference.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Find Contractors',
          onPress: async () => {
            setConverting(true);
            try {
              const { error } = await supabase
                .from('projects')
                .update({ diy_guide: guide, status: 'draft' })
                .eq('id', store.projectId!);
              if (error) throw error;
              store.reset();
              navigation.navigate('HomeownerTabs', { screen: 'Projects' });
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to convert project.');
            } finally {
              setConverting(false);
            }
          },
        },
      ],
    );
  };

  const tools = guide.materials.filter((m) => m.is_tool);
  const supplies = guide.materials.filter((m) => !m.is_tool);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>DIY Guide</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSave}
            disabled={saving || saved}
          >
            <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={16} color={saved ? '#000' : '#fff'} />
            <Text style={[styles.saveBtnText, saved && { color: '#000' }]}>
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="hammer" size={28} color="#FF6B00" />
            </View>
            <Text style={styles.heroTitle}>{guide.title}</Text>
            <Text style={styles.heroOverview}>{guide.overview}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={14} color={Colors.text.secondary} />
                <Text style={styles.metaText}>{guide.estimated_time}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="bar-chart-outline" size={14} color={Colors.text.secondary} />
                <Text style={styles.metaText}>{guide.difficulty}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="cash-outline" size={14} color={Colors.text.secondary} />
                <Text style={styles.metaText}>{guide.total_estimated_cost}</Text>
              </View>
            </View>
          </View>

          {/* Safety warnings */}
          {guide.safety_warnings.length > 0 && (
            <View style={styles.warningBox}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning-outline" size={18} color="#F59E0B" />
                <Text style={styles.warningTitle}>Safety First</Text>
              </View>
              {guide.safety_warnings.map((w, i) => (
                <View key={i} style={styles.warningItem}>
                  <Text style={styles.warningDot}>•</Text>
                  <Text style={styles.warningText}>{w}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === 'steps' && styles.tabActive]}
              onPress={() => setTab('steps')}
            >
              <Text style={[styles.tabText, tab === 'steps' && styles.tabTextActive]}>Steps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'materials' && styles.tabActive]}
              onPress={() => setTab('materials')}
            >
              <Text style={[styles.tabText, tab === 'materials' && styles.tabTextActive]}>
                Materials ({guide.materials.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Steps tab */}
          {tab === 'steps' && (
            <View style={styles.stepsContainer}>
              {guide.steps.map((step) => (
                <View key={step.step_number} style={styles.stepCard}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{step.step_number}</Text>
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.description}</Text>
                    {step.tip && (
                      <View style={styles.tipBox}>
                        <Ionicons name="bulb-outline" size={14} color="#A78BFA" />
                        <Text style={styles.tipText}>{step.tip}</Text>
                      </View>
                    )}
                    {step.warning && (
                      <View style={styles.stepWarnBox}>
                        <Ionicons name="alert-circle-outline" size={14} color="#F59E0B" />
                        <Text style={styles.stepWarnText}>{step.warning}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {/* When to call a pro */}
              <View style={styles.proBox}>
                <View style={styles.proHeader}>
                  <Ionicons name="call-outline" size={18} color="#60A5FA" />
                  <Text style={styles.proTitle}>When to call a pro</Text>
                </View>
                <Text style={styles.proText}>{guide.when_to_call_pro}</Text>
              </View>
            </View>
          )}

          {/* Materials tab */}
          {tab === 'materials' && (
            <View style={styles.materialsContainer}>
              {tools.length > 0 && (
                <>
                  <Text style={styles.matSectionTitle}>Tools Needed</Text>
                  {tools.map((m, i) => (
                    <View key={i} style={styles.matCard}>
                      <View style={styles.matIcon}>
                        <Ionicons name="hammer-outline" size={18} color="#FF6B00" />
                      </View>
                      <View style={styles.matBody}>
                        <Text style={styles.matName}>{m.name}</Text>
                        <Text style={styles.matWhere}>{m.where_to_buy}</Text>
                      </View>
                      <View style={styles.matRight}>
                        <Text style={styles.matQty}>×{m.quantity}</Text>
                        <Text style={styles.matCost}>{m.estimated_cost}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
              {supplies.length > 0 && (
                <>
                  <Text style={[styles.matSectionTitle, tools.length > 0 && { marginTop: 20 }]}>Supplies & Materials</Text>
                  {supplies.map((m, i) => (
                    <View key={i} style={styles.matCard}>
                      <View style={[styles.matIcon, { backgroundColor: 'rgba(96,165,250,0.15)' }]}>
                        <Ionicons name="cube-outline" size={18} color="#60A5FA" />
                      </View>
                      <View style={styles.matBody}>
                        <Text style={styles.matName}>{m.name}</Text>
                        <Text style={styles.matWhere}>{m.where_to_buy}</Text>
                      </View>
                      <View style={styles.matRight}>
                        <Text style={styles.matQty}>×{m.quantity}</Text>
                        <Text style={styles.matCost}>{m.estimated_cost}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Estimated Total</Text>
                <Text style={styles.totalValue}>{guide.total_estimated_cost}</Text>
              </View>
            </View>
          )}
          {/* Get Pro Help */}
          <View style={styles.proHelpSection}>
            <View style={styles.proHelpCard}>
              <View style={styles.proHelpIcon}>
                <Ionicons name="construct-outline" size={22} color="#60A5FA" />
              </View>
              <View style={styles.proHelpBody}>
                <Text style={styles.proHelpTitle}>Too complex to DIY?</Text>
                <Text style={styles.proHelpSub}>Convert to a contractor project and get quotes</Text>
              </View>
              <TouchableOpacity
                style={[styles.proHelpBtn, converting && styles.proHelpBtnDisabled]}
                onPress={handleGetProHelp}
                disabled={converting}
              >
                <Text style={styles.proHelpBtnText}>{converting ? 'Converting…' : 'Get Help'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtnDone: { backgroundColor: '#FF6B00', borderColor: '#FF6B00' },
  saveBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  scroll: { paddingBottom: 120 },

  hero: { margin: Spacing.md, backgroundColor: Colors.glass.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.glass.border, padding: 20, alignItems: 'center' },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,107,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  heroOverview: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface.default, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.surface.border },
  metaText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },

  warningBox: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', padding: 16 },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },
  warningItem: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  warningDot: { color: '#F59E0B', fontSize: 14, marginTop: 1 },
  warningText: { fontSize: 13, color: 'rgba(245,158,11,0.9)', flex: 1, lineHeight: 20 },

  tabs: { flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.md, backgroundColor: Colors.surface.default, borderRadius: Radius.pill, padding: 4, borderWidth: 1, borderColor: Colors.surface.border },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: '#FF6B00' },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.text.tertiary },
  tabTextActive: { color: '#fff' },

  stepsContainer: { paddingHorizontal: Spacing.md, gap: 12 },
  stepCard: { flexDirection: 'row', gap: 14, backgroundColor: Colors.glass.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.glass.border, padding: 16 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,107,0,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 14, fontWeight: '700', color: '#FF6B00' },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 6 },
  stepDesc: { fontSize: 14, color: Colors.text.secondary, lineHeight: 21 },
  tipBox: { flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: 'rgba(167,139,250,0.1)', borderRadius: 8, padding: 10, alignItems: 'flex-start' },
  tipText: { fontSize: 13, color: '#A78BFA', flex: 1, lineHeight: 19 },
  stepWarnBox: { flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 10, alignItems: 'flex-start' },
  stepWarnText: { fontSize: 13, color: '#F59E0B', flex: 1, lineHeight: 19 },

  proBox: { backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)', padding: 16, marginTop: 4 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  proTitle: { fontSize: 14, fontWeight: '700', color: '#60A5FA' },
  proText: { fontSize: 13, color: 'rgba(96,165,250,0.85)', lineHeight: 20 },

  materialsContainer: { paddingHorizontal: Spacing.md },
  matSectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  matCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.glass.surface, borderRadius: Radius.item, borderWidth: 1, borderColor: Colors.glass.border, padding: 14, marginBottom: 8 },
  matIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,107,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  matBody: { flex: 1 },
  matName: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  matWhere: { fontSize: 12, color: Colors.text.tertiary },
  matRight: { alignItems: 'flex-end' },
  matQty: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 2 },
  matCost: { fontSize: 13, fontWeight: '600', color: '#FF6B00' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface.default, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.surface.border, padding: 16, marginTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#FF6B00' },

  proHelpSection: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: 8 },
  proHelpCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)', padding: 14 },
  proHelpIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(96,165,250,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  proHelpBody: { flex: 1 },
  proHelpTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  proHelpSub: { fontSize: 12, color: Colors.text.tertiary, lineHeight: 17 },
  proHelpBtn: { backgroundColor: '#60A5FA', borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  proHelpBtnDisabled: { opacity: 0.5 },
  proHelpBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
});
