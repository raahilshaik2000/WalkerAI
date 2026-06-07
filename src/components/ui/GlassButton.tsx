import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radius } from '@/constants/theme';
import { AnimatedPressable } from './AnimatedPressable';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface GlassButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  haptic?: boolean;
  hapticStyle?: string;
}

// Uber-style button variants
const VARIANT_CONFIG: Record<
  ButtonVariant,
  { bg: string; textColor: string; borderColor?: string }
> = {
  // White button, black text — Uber's primary CTA
  primary: {
    bg: '#FFFFFF',
    textColor: '#000000',
  },
  // Dark surface button
  secondary: {
    bg: Colors.surface.default,
    textColor: Colors.text.primary,
    borderColor: Colors.surface.border,
  },
  destructive: {
    bg: 'rgba(224,11,11,0.12)',
    textColor: Colors.error,
    borderColor: 'rgba(224,11,11,0.3)',
  },
  ghost: {
    bg: 'transparent',
    textColor: Colors.text.primary,
  },
};

const SIZE_CONFIG = {
  sm: { height: 40, paddingHorizontal: 16, fontSize: 14 },
  md: { height: 52, paddingHorizontal: 24, fontSize: 15 },
  lg: { height: 58, paddingHorizontal: 32, fontSize: 16 },
};

export function GlassButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = false,
  size = 'md',
  haptic = false,
  hapticStyle = 'impactMedium',
}: GlassButtonProps) {
  const config = VARIANT_CONFIG[variant];
  const sizeConfig = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  const buttonStyle: ViewStyle = {
    height: sizeConfig.height,
    paddingHorizontal: sizeConfig.paddingHorizontal,
    borderRadius: Radius.button,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: isDisabled ? 0.4 : 1,
    backgroundColor: config.bg,
    borderWidth: config.borderColor ? 1 : 0,
    borderColor: config.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      haptic={haptic}
      hapticStyle={hapticStyle}
      style={[buttonStyle, style]}
    >
      <View style={styles.contentRow}>
        {loading ? (
          <ActivityIndicator size="small" color={config.textColor} />
        ) : (
          <>
            {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
            <Text style={[styles.label, { fontSize: sizeConfig.fontSize, color: config.textColor }, textStyle]}>
              {label}
            </Text>
            {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
          </>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '600', letterSpacing: 0 },
  iconLeft: { marginRight: 8 },
  iconRight: { marginLeft: 8 },
});
