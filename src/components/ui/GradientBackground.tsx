import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface GradientBackgroundProps {
  children: React.ReactNode;
  glow?: 'top-left' | 'top-right' | 'center' | 'none';
}

// Uber-style: flat black background, no decorative gradients or glows
export function GradientBackground({ children }: GradientBackgroundProps) {
  return (
    <View style={styles.container}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
});
