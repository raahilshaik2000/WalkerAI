import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { useAuthStore } from '@/stores/auth.store';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, AddressAutocomplete } from '@/components/ui';
import type { AddressResult } from '@/components/ui';
import type { RoomType } from '@/constants/enums';

const ROOM_TYPES: { value: RoomType; icon: string; label: string; desc: string }[] = [
  { value: 'kitchen', icon: '🍳', label: 'Kitchen', desc: 'Remodel or renovation' },
  { value: 'bathroom', icon: '🚿', label: 'Bathroom', desc: 'Full or partial reno' },
];

export default function AddressStep() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { setAddress, setStep } = useProjectWizardStore();
  const state = useProjectWizardStore();

  const [roomType, setRoomType] = useState<RoomType>('kitchen');
  const [addressResult, setAddressResult] = useState<AddressResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!addressResult) {
      Alert.alert('Required', 'Please select your project address.');
      return;
    }

    setLoading(true);
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          homeowner_id: user!.id,
          address: addressResult.fullAddress,
          city: addressResult.city,
          province: addressResult.province,
          postal_code: addressResult.postalCode || null,
          room_type: roomType,
          status: 'draft',
        })
        .select('id')
        .single();

      if (error) throw error;

      setAddress(
        addressResult.fullAddress,
        addressResult.lat && addressResult.lng
          ? { lat: addressResult.lat, lng: addressResult.lng }
          : undefined,
        undefined,
        addressResult.province,
      );
      useProjectWizardStore.getState().setProjectId(project.id);
      useProjectWizardStore.getState().setStep(2);

      navigation.navigate('Photos');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setLoading(false);
    }
  };

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
            {/* Header row: close button + progress bar */}
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              <View style={styles.progressRow}>
                {Array.from({ length: 7 }, (_, i) => (
                  <View
                    key={i}
                    style={[styles.progressSeg, i === 0 && styles.progressSegActive]}
                  />
                ))}
              </View>
            </View>

            <Text style={styles.stepLabel}>STEP 1 OF 7</Text>
            <Text style={styles.title}>Where's the project?</Text>
            <Text style={styles.subtitle}>
              We use your address to find verified contractors near you.
            </Text>

            {/* Room type */}
            <Text style={styles.sectionLabel}>What are we renovating?</Text>
            <View style={styles.roomRow}>
              {ROOM_TYPES.map((rt) => (
                <TouchableOpacity
                  key={rt.value}
                  style={[styles.roomCard, roomType === rt.value && styles.roomCardActive]}
                  onPress={() => setRoomType(rt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.roomIcon}>{rt.icon}</Text>
                  <Text style={[styles.roomLabel, roomType === rt.value && styles.roomLabelActive]}>
                    {rt.label}
                  </Text>
                  <Text style={styles.roomDesc}>{rt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.card}>
              <AddressAutocomplete
                placeholder="Search your address..."
                onSelect={(result) => setAddressResult(result)}
              />
              {addressResult && (
                <View style={styles.selectedAddress}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={styles.selectedText}>{addressResult.fullAddress}</Text>
                </View>
              )}
            </View>

            <GlassButton
              label="Continue — Add Photos"
              onPress={handleNext}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.cta}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.lg,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: { flex: 1, flexDirection: 'row', gap: 5 },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressSegActive: { backgroundColor: Colors.accent },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  sectionLabel: { ...Typography.label, marginBottom: 12 },
  roomRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  roomCard: {
    flex: 1,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  roomCardActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  roomIcon: { fontSize: 28 },
  roomLabel: { fontSize: 15, fontWeight: '600', color: Colors.text.secondary },
  roomLabelActive: { color: Colors.text.primary },
  roomDesc: { fontSize: 12, color: Colors.text.tertiary },
  card: { marginBottom: Spacing.md, zIndex: 10 },
  selectedAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  selectedText: { fontSize: 13, color: Colors.text.secondary, flex: 1 },
  cta: {},
});
