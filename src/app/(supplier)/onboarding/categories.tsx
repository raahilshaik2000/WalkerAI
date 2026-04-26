import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import { SUPPLIER_CATEGORIES, type SupplierCategory } from '@/constants/enums';

export default function SupplierCategoriesOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<Set<SupplierCategory>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (cat: SupplierCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleFinish = async () => {
    if (selected.size === 0) {
      Alert.alert('Required', 'Please select at least one material category you supply.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ categories: Array.from(selected) })
        .eq('user_id', user!.id);
      if (error) throw error;
      navigation.navigate('SupplierPendingVerification');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>

          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.stepDot, styles.stepDotActive]} />
            ))}
          </View>

          <Text style={styles.title}>What do you supply?</Text>
          <Text style={styles.subtitle}>Select all categories that apply — you can update this later</Text>

          <GlassCard style={styles.card}>
            <View style={styles.grid}>
              {SUPPLIER_CATEGORIES.map((cat) => {
                const active = selected.has(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggle(cat)}
                    activeOpacity={0.7}
                  >
                    {active && <Ionicons name="checkmark" size={14} color={Colors.accent} />}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>

          <Text style={styles.selectedCount}>
            {selected.size} categor{selected.size === 1 ? 'y' : 'ies'} selected
          </Text>

          <GlassButton label="Submit for Review" onPress={handleFinish} loading={loading} fullWidth size="lg" style={styles.btn} />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  back: { marginBottom: Spacing.md },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  stepDotActive: { backgroundColor: Colors.accent, width: 24 },
  title: { ...Typography.h1, marginBottom: 6 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { padding: Spacing.md, marginBottom: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255,107,0,0.12)',
  },
  chipText: { fontSize: 13, color: Colors.text.secondary },
  chipTextActive: { color: Colors.text.primary, fontWeight: '600' },
  selectedCount: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', marginBottom: Spacing.md },
  btn: { marginTop: 4 },
});
