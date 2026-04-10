import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GlassCard } from '@/components/ui';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface RoomSummaryCardProps {
  length: number;
  width: number;
  height: number;
  area: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
}

export function RoomSummaryCard({
  length,
  width,
  height,
  area,
  wallCount,
  doorCount,
  windowCount,
}: RoomSummaryCardProps) {
  return (
    <GlassCard style={styles.card} padding={20}>
      <Text style={styles.title}>Room Summary</Text>

      <View style={styles.dimensionsRow}>
        <DimensionItem label="Length" value={`${length.toFixed(1)}m`} />
        <DimensionItem label="Width" value={`${width.toFixed(1)}m`} />
        <DimensionItem label="Height" value={`${height.toFixed(1)}m`} />
      </View>

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <StatItem icon="resize-outline" value={`${area.toFixed(1)} m²`} label="Area" />
        <StatItem icon="grid-outline" value={`${wallCount}`} label="Walls" />
        <StatItem icon="enter-outline" value={`${doorCount}`} label="Doors" />
        <StatItem icon="browsers-outline" value={`${windowCount}`} label="Windows" />
      </View>
    </GlassCard>
  );
}

function DimensionItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dimItem}>
      <Text style={styles.dimLabel}>{label}</Text>
      <Text style={styles.dimValue}>{value}</Text>
    </View>
  );
}

function StatItem({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={18} color={Colors.text.secondary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm },
  title: { ...Typography.h2, marginBottom: Spacing.sm },
  dimensionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dimItem: { alignItems: 'center', flex: 1 },
  dimLabel: { ...Typography.label, marginBottom: 4 },
  dimValue: { ...Typography.h1, color: '#FF6B00' },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.border,
    marginVertical: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { ...Typography.h3, marginTop: 4 },
  statLabel: { ...Typography.caption, fontSize: 11, marginTop: 2 },
});
