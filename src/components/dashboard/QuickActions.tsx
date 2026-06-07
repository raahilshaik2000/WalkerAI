import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { QUICK_ACTIONS } from './data';
import { useStaggeredEntrance } from './useStaggeredEntrance';

export function QuickActions() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(2);
  const { width } = useWindowDimensions();
  const itemWidth = Math.max(108, (width - 48) / 3);

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {QUICK_ACTIONS.map((action) => (
          <AnimatedPressable
            key={action.id}
            style={[styles.item, { width: itemWidth }]}
            haptic
            onPress={() => navigation.navigate(action.route)}
          >
            <View style={[styles.iconCircle, { backgroundColor: action.color + '18' }]}>
              <Ionicons name={action.icon as any} size={18} color={action.color} />
            </View>
            <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
              {action.label}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md, marginHorizontal: -16 },
  row: { gap: 8, paddingHorizontal: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 8,
    paddingVertical: 10,
    height: 50,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
