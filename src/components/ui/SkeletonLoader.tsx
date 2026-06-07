import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Radius } from '@/constants/theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius = Radius.sm, style }: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View
      style={[
        styles.base,
        { width: width as number, height, borderRadius: radius },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255,255,255,0.06)',
            'rgba(255,255,255,0.12)',
            'rgba(255,255,255,0.06)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** Pre-built skeleton for a card with title + subtitle + body */
export function CardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skeletonStyles.card, style]}>
      <Skeleton width="60%" height={18} radius={6} style={{ marginBottom: 10 }} />
      <Skeleton width="40%" height={13} radius={5} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={12} radius={4} style={{ marginBottom: 8 }} />
      <Skeleton width="85%" height={12} radius={4} style={{ marginBottom: 8 }} />
      <Skeleton width="70%" height={12} radius={4} />
    </View>
  );
}

/** Pre-built skeleton for a list item row */
export function ListItemSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skeletonStyles.row, style]}>
      <Skeleton width={44} height={44} radius={22} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="55%" height={14} radius={5} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={12} radius={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.glass.surface,
    overflow: 'hidden',
  },
});

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
