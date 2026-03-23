import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { Colors, Radius } from '@/constants/theme';

type BadgeVariant =
  | 'pending'
  | 'active'
  | 'completed'
  | 'paid'
  | 'error'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'dispatching'
  | 'approved'
  | 'disputed';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  pending: {
    bg: 'rgba(245, 158, 11, 0.15)',
    text: '#F59E0B',
    dot: '#F59E0B',
  },
  active: {
    bg: 'rgba(16, 185, 129, 0.15)',
    text: '#10B981',
    dot: '#10B981',
  },
  completed: {
    bg: 'rgba(16, 185, 129, 0.15)',
    text: '#10B981',
    dot: '#10B981',
  },
  paid: {
    bg: 'rgba(16, 185, 129, 0.15)',
    text: '#10B981',
    dot: '#10B981',
  },
  approved: {
    bg: 'rgba(59, 130, 246, 0.15)',
    text: '#3B82F6',
    dot: '#3B82F6',
  },
  dispatching: {
    bg: 'rgba(59, 130, 246, 0.15)',
    text: '#3B82F6',
    dot: '#3B82F6',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    text: '#3B82F6',
    dot: '#3B82F6',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    text: '#F59E0B',
    dot: '#F59E0B',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#EF4444',
    dot: '#EF4444',
  },
  disputed: {
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#EF4444',
    dot: '#EF4444',
  },
  neutral: {
    bg: Colors.glass.surface,
    text: Colors.text.secondary,
    dot: Colors.text.tertiary,
  },
};

export function StatusBadge({
  label,
  variant = 'neutral',
  size = 'md',
  style,
  dot = false,
}: StatusBadgeProps) {
  const variantStyle = VARIANT_STYLES[variant];
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: variantStyle.bg,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 3 : 5,
          borderRadius: Radius.pill,
          borderColor: `${variantStyle.text}30`,
        },
        style,
      ]}
    >
      {dot && (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: variantStyle.dot,
              width: isSmall ? 5 : 6,
              height: isSmall ? 5 : 6,
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          {
            color: variantStyle.text,
            fontSize: isSmall ? 11 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  dot: {
    borderRadius: 99,
    marginRight: 5,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
