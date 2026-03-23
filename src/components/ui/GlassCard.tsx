import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius } from '@/constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  blurIntensity?: number; // kept for API compat, unused
  border?: boolean;
  selected?: boolean;
  radius?: number;
  padding?: number;
}

// Uber-style: flat dark card, solid border, no blur or gradient
export function GlassCard({
  children,
  style,
  border = true,
  selected = false,
  radius = Radius.card,
  padding = 16,
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: radius,
          borderWidth: border ? 1 : 0,
          borderColor: selected ? '#FFFFFF' : Colors.surface.border,
          backgroundColor: selected ? Colors.surface.hover : Colors.surface.default,
        },
        style,
      ]}
    >
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
