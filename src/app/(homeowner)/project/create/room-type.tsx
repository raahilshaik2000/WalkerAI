import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, WizardHeader } from '@/components/ui';
import type { RoomType } from '@/constants/enums';

const ROOM_TYPES: { value: RoomType; icon: string; label: string; desc: string }[] = [
  { value: 'kitchen', icon: 'stove', label: 'Kitchen', desc: 'Full remodel or renovation' },
  { value: 'bathroom', icon: 'shower-head', label: 'Bathroom', desc: 'Full or partial renovation' },
];

export default function RoomTypeStep() {
  const navigation = useNavigation<any>();
  const { setRoomType } = useProjectWizardStore();
  const [selected, setSelected] = useState<RoomType>('kitchen');

  const handleContinue = () => {
    setRoomType(selected);
    useProjectWizardStore.getState().setStep(2);
    navigation.navigate('Photos');
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <WizardHeader currentStep={1} showBack={false} />

          <Text style={styles.stepLabel}>STEP 1 OF 8</Text>
          <Text style={styles.title}>What are we{'\n'}renovating?</Text>
          <Text style={styles.subtitle}>
            Select the type of space you'd like to transform.
          </Text>

          {/* Room type cards */}
          <View style={styles.cardsRow}>
            {ROOM_TYPES.map((rt) => {
              const isActive = selected === rt.value;
              return (
                <TouchableOpacity
                  key={rt.value}
                  style={[styles.card, isActive && styles.cardActive]}
                  onPress={() => setSelected(rt.value)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconCircle, isActive && styles.iconCircleActive]}>
                    <Icon
                      name={rt.icon}
                      size={32}
                      color={isActive ? '#FF6B00' : Colors.text.tertiary}
                    />
                  </View>
                  <Text style={[styles.cardLabel, isActive && styles.cardLabelActive]}>
                    {rt.label}
                  </Text>
                  <Text style={styles.cardDesc}>{rt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* CTA */}
          <GlassButton
            label="Continue"
            onPress={handleContinue}
            fullWidth
            size="lg"
          />
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepLabel: {
    ...Typography.label,
    color: '#FF6B00',
    marginBottom: 8,
  },
  title: {
    ...Typography.h1,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.bodySecondary,
    marginBottom: Spacing.xl,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  cardActive: {
    borderColor: '#FF6B00',
    backgroundColor: 'rgba(255, 107, 0, 0.06)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconCircleActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  cardLabelActive: {
    color: Colors.text.primary,
  },
  cardDesc: {
    fontSize: 12,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
});
