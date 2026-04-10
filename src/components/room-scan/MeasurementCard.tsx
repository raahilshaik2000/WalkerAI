import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GlassCard } from '@/components/ui';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface MeasurementCardProps {
  icon: string;
  iconColor: string;
  label: string;
  dimensions: string;
  subtitle?: string;
}

export function MeasurementCard({ icon, iconColor, label, dimensions, subtitle }: MeasurementCardProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: `${iconColor}20` }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>{label}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <Text style={styles.dimensions}>{dimensions}</Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, marginLeft: 12 },
  label: { ...Typography.h3, fontSize: 15 },
  subtitle: { ...Typography.caption, marginTop: 2 },
  dimensions: {
    ...Typography.h3,
    color: '#FF6B00',
    fontSize: 15,
  },
});
