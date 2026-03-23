import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/components/ui';
import { Colors } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  actionLabel?: string;
}

export function SectionHeader({ title, subtitle, onPress, actionLabel = 'See all' }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {onPress && (
        <AnimatedPressable onPress={onPress} haptic>
          <Text style={styles.action}>{actionLabel}</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  left: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: Colors.text.tertiary, marginTop: 2 },
  action: { fontSize: 13, color: Colors.accent, fontWeight: '500' },
});
