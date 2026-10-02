import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface GradientBackgroundProps {
  children: React.ReactNode;
  glow?: 'top-left' | 'top-right' | 'center' | 'none';
}

const GLOW_POSITIONS: Record<Exclude<NonNullable<GradientBackgroundProps['glow']>, 'none'>, object> = {
  'top-left': { top: -80, left: -60 },
  'top-right': { top: -80, right: -60 },
  center: { top: '28%', alignSelf: 'center' },
};

export function GradientBackground({ children, glow = 'none' }: GradientBackgroundProps) {
  return (
    <View style={styles.container}>
      {glow && glow !== 'none' ? (
        <View pointerEvents="none" style={[styles.glow, GLOW_POSITIONS[glow]]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
});
