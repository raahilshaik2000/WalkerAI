import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
            style={styles.item}
            haptic
            onPress={() => navigation.navigate(action.route)}
          >
            <View style={[styles.iconCircle, { backgroundColor: action.color + '18' }]}>
              <Ionicons name={action.icon as any} size={18} color={action.color} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{action.label}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md, marginHorizontal: -16 },
  row: { gap: 10, paddingHorizontal: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    height: 48,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
