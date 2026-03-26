import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useDIYWizardStore, type SkillLevel } from '@/stores/diy-wizard.store';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

const SKILL_LEVELS: { id: SkillLevel; label: string; desc: string; icon: string; color: string }[] = [
  { id: 'beginner',     label: 'Beginner',     desc: 'Little to no experience', icon: 'happy-outline',    color: '#34D399' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Some DIY experience',       icon: 'build-outline',    color: '#F59E0B' },
  { id: 'advanced',     label: 'Advanced',     desc: 'Comfortable with most tasks', icon: 'ribbon-outline', color: '#FF6B00' },
];

const TIMELINES = ['This weekend', 'This week', 'This month', 'No rush'];

const BUDGET_PRESETS = [
  { label: 'Under $100',    min: 0,   max: 100  },
  { label: '$100 – $300',   min: 100, max: 300  },
  { label: '$300 – $1,000', min: 300, max: 1000 },
  { label: '$1,000+',       min: 1000, max: 5000 },
];

export default function DIYDetailsScreen() {
  const navigation = useNavigation<any>();
  const store = useDIYWizardStore();

  const [selectedBudgetIdx, setSelectedBudgetIdx] = useState<number | null>(null);
  const [skill, setSkill] = useState<SkillLevel>(store.skillLevel);
  const [timeline, setTimeline] = useState(store.timeline);
  const [tools, setTools] = useState(store.toolsAvailable);

  const canContinue = selectedBudgetIdx !== null;

  const handleGenerate = () => {
    const preset = BUDGET_PRESETS[selectedBudgetIdx!];
    store.setBudget(preset.min, preset.max);
    store.setSkillLevel(skill);
    store.setTimeline(timeline);
    store.setToolsAvailable(tools.trim());
    navigation.navigate('DIYGenerating');
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
          <Text style={styles.title}>A few more{'\n'}details</Text>
          <Text style={styles.subtitle}>Help us tailor the guide to your budget and skill level.</Text>

          {/* Budget */}
          <Text style={styles.fieldLabel}>Budget</Text>
          <View style={styles.row}>
            {BUDGET_PRESETS.map((b, i) => (
              <TouchableOpacity
                key={b.label}
                style={[styles.pill, selectedBudgetIdx === i && styles.pillActive]}
                onPress={() => setSelectedBudgetIdx(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, selectedBudgetIdx === i && styles.pillTextActive]}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Skill level */}
          <Text style={styles.fieldLabel}>Your skill level</Text>
          <View style={styles.skillRow}>
            {SKILL_LEVELS.map((s) => {
              const active = skill === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.skillCard, active && { borderColor: s.color, backgroundColor: s.color + '15' }]}
                  onPress={() => setSkill(s.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={s.icon as any} size={22} color={active ? s.color : Colors.text.tertiary} />
                  <Text style={[styles.skillLabel, active && { color: s.color }]}>{s.label}</Text>
                  <Text style={styles.skillDesc}>{s.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Timeline */}
          <Text style={styles.fieldLabel}>Timeline</Text>
          <View style={styles.timelineRow}>
            {TIMELINES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pill, timeline.toLowerCase() === t.toLowerCase() && styles.pillActive]}
                onPress={() => setTimeline(t.toLowerCase())}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, timeline.toLowerCase() === t.toLowerCase() && styles.pillTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tools */}
          <Text style={styles.fieldLabel}>Tools you have (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. drill, hammer, wrench, level..."
            placeholderTextColor={Colors.text.tertiary}
            value={tools}
            onChangeText={setTools}
          />

          <GlassButton
            label="Generate My Guide"
            onPress={handleGenerate}
            disabled={!canContinue}
            fullWidth
            size="lg"
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  backText: { color: '#fff', fontSize: 16 },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg, lineHeight: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
  timelineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border },
  pillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  pillText: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  pillTextActive: { color: '#000' },
  skillRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  skillCard: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.surface.border, backgroundColor: Colors.surface.default, gap: 6 },
  skillLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.secondary },
  skillDesc: { fontSize: 11, color: Colors.text.tertiary, textAlign: 'center' },
  input: { backgroundColor: Colors.glass.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.glass.border, color: '#fff', fontSize: 15, padding: 14, marginBottom: Spacing.lg },
  cta: { marginTop: 8 },
});
