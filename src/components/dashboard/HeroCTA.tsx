import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable, GlassButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ROOM_TYPE_PICKS } from './data';
import { useStaggeredEntrance } from './useStaggeredEntrance';

export function HeroCTA() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(1);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.title}>Start Your Next Project</Text>
      <Text style={styles.subtitle}>Kitchen or bathroom — let's get started</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsRow}
        style={styles.pillsScroll}
      >
        {ROOM_TYPE_PICKS.map((room) => (
          <AnimatedPressable
            key={room.id}
            style={styles.pill}
            haptic
            onPress={() => navigation.navigate('ProjectCreate')}
          >
            <View style={styles.pillIcon}>
              <Ionicons name={room.icon as any} size={18} color="#fff" />
            </View>
            <Text style={styles.pillLabel}>{room.label}</Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      <GlassButton
        label="Post a Project"
        onPress={() => navigation.navigate('ProjectCreate')}
        variant="primary"
        fullWidth
        haptic
        size="md"
        icon={<Ionicons name="add-circle" size={18} color="#000" />}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 20,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  pillsScroll: { marginBottom: 18 },
  pillsRow: { gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface.hover,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
