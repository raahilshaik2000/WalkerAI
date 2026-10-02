import React, { useEffect, useRef, useState } from 'react';
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

function hasFilledValue(value: TextInputProps['value']): boolean {
  return value != null && String(value).length > 0;
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
  defaultValue,
  onFocus,
  onBlur,
  placeholder: _placeholder,
  ...props
}: GlassInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [uncontrolledFilled, setUncontrolledFilled] = useState(hasFilledValue(defaultValue));
  const isControlled = value !== undefined;
  const filled = isControlled ? hasFilledValue(value) : uncontrolledFilled;
  const shouldFloat = filled || isFocused;
  const labelAnim = useRef(new Animated.Value(shouldFloat ? 1 : 0)).current;
  const inputRef = useRef<TextInput>(null);

  // Keep floating label in sync when value is hydrated/prefilled after mount
  // (edit forms, profile screens, async loads). Without this, the label sits
  // on top of the filled text.
  useEffect(() => {
    Animated.spring(labelAnim, {
      toValue: shouldFloat ? 1 : 0,
      useNativeDriver: false,
      damping: 15,
      stiffness: 300,
    }).start();
  }, [shouldFloat, labelAnim]);

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChangeText = (text: string) => {
    if (!isControlled) setUncontrolledFilled(text.length > 0);
    props.onChangeText?.(text);
  };

  const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 6] });
  const labelFontSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 11] });
  const labelColor = shouldFloat
    ? (isFocused ? Colors.text.secondary : Colors.text.tertiary)
    : Colors.text.tertiary;

  const borderColor = error
    ? Colors.error
    : isFocused
    ? '#FFFFFF'
    : Colors.surface.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
        <View style={[styles.inputWrapper, props.multiline ? styles.inputWrapperMultiline : null, { borderColor }]}>
          {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          <View style={styles.fieldArea}>
            <Animated.Text
              pointerEvents="none"
              numberOfLines={1}
              style={[styles.floatLabel, { top: labelTop, fontSize: labelFontSize, color: labelColor }]}
            >
              {label}
            </Animated.Text>
            <TextInput
              ref={inputRef}
              {...props}
              style={[
                styles.input,
                shouldFloat ? styles.inputShifted : null,
                props.multiline ? styles.inputMultiline : null,
              ]}
              value={value}
              defaultValue={defaultValue}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChangeText={handleChangeText}
              placeholder=""
              placeholderTextColor="transparent"
              selectionColor="#FFFFFF"
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
    minHeight: 58,
    height: 58,
    borderRadius: Radius.item,
    borderWidth: 1,
    backgroundColor: Colors.surface.default,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  inputWrapperMultiline: {
    height: undefined,
    minHeight: 96,
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  fieldArea: { flex: 1, justifyContent: 'center', position: 'relative', height: '100%' },
  floatLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontWeight: '500',
    zIndex: 1,
  },
  input: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.text.primary,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
  },
  inputShifted: { paddingTop: 18 },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 22,
  },
  iconLeft: { marginRight: 12 },
  iconRight: { marginLeft: 12 },
  error: { fontSize: 13, color: Colors.error, marginTop: 6, marginLeft: 4 },
  hint: { fontSize: 13, color: Colors.text.tertiary, marginTop: 6, marginLeft: 4 },
});
