import React, { useRef, useState } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radius } from '@/constants/theme';

interface GlassInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  containerStyle?: StyleProp<ViewStyle>;
}

// Uber-style input: flat dark background, subtle border, white focus border
export function GlassInput({
  label,
  error,
  hint,
  icon,
  iconPosition = 'left',
  containerStyle,
  value,
  onFocus,
  onBlur,
  ...props
}: GlassInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const inputRef = useRef<TextInput>(null);

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setIsFocused(true);
    Animated.spring(labelAnim, {
      toValue: 1,
      useNativeDriver: false,
      damping: 15,
      stiffness: 300,
    }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setIsFocused(false);
    if (!value) {
      Animated.spring(labelAnim, {
        toValue: 0,
        useNativeDriver: false,
        damping: 15,
        stiffness: 300,
      }).start();
    }
    onBlur?.(e);
  };

  const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 8] });
  const labelFontSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 11] });

  const borderColor = error
    ? Colors.error
    : isFocused
    ? '#FFFFFF'
    : Colors.surface.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
        <View style={[styles.inputWrapper, { borderColor }]}>
          {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          <View style={styles.fieldArea}>
            <Animated.Text style={[styles.floatLabel, { top: labelTop, fontSize: labelFontSize }]}>
              {label}
            </Animated.Text>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                Boolean(value) || isFocused ? styles.inputShifted : null,
              ]}
              value={value}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholderTextColor={Colors.text.tertiary}
              selectionColor="#FFFFFF"
              {...props}
            />
          </View>
          {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
        </View>
      </TouchableWithoutFeedback>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  inputWrapper: {
    height: 58,
    borderRadius: Radius.item,
    borderWidth: 1,
    backgroundColor: Colors.surface.default,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  fieldArea: { flex: 1, justifyContent: 'center', position: 'relative', height: '100%' },
  floatLabel: {
    position: 'absolute',
    left: 0,
    fontWeight: '400',
    color: Colors.text.tertiary,
  },
  input: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.text.primary,
    paddingTop: 0,
    paddingBottom: 0,
  },
  inputShifted: { paddingTop: 18 },
  iconLeft: { marginRight: 12 },
  iconRight: { marginLeft: 12 },
  error: { fontSize: 13, color: Colors.error, marginTop: 6, marginLeft: 4 },
  hint: { fontSize: 13, color: Colors.text.tertiary, marginTop: 6, marginLeft: 4 },
});
