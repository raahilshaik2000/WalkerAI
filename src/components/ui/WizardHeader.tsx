import React from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors } from '@/constants/theme';

interface WizardHeaderProps {
  currentStep: number;
  totalSteps?: number;
  showBack?: boolean;
}

export function WizardHeader({
  currentStep,
  totalSteps = 8,
  showBack = true,
}: WizardHeaderProps) {
  const navigation = useNavigation<any>();
  const { reset } = useProjectWizardStore();

  const handleCancel = () => {
    Alert.alert(
      'Cancel project?',
      'All progress will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => {
            reset();
            navigation.reset({ index: 0, routes: [{ name: 'HomeownerTabs' }] });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.headerRow}>
      {showBack ? (
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      ) : (
        <View style={styles.btnPlaceholder} />
      )}

      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            style={[styles.progressSeg, i < currentStep && styles.progressSegActive]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={styles.btn}
        onPress={handleCancel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPlaceholder: {
    width: 32,
    height: 32,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressSegActive: {
    backgroundColor: '#FF6B00',
  },
});
