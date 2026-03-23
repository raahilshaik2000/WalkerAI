import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing } from '@/constants/theme';
import { getGreeting } from './data';
import { useStaggeredEntrance } from './useStaggeredEntrance';

export function DashboardHeader() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const animatedStyle = useStaggeredEntrance(0);

  const displayName = user?.email?.split('@')[0] ?? 'Homeowner';

  return (
    <Animated.View style={animatedStyle}>
      {/* Top row: greeting + notification */}
      <View style={styles.topRow}>
        <View style={styles.greetingCol}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.location}>
            <Ionicons name="location-outline" size={11} color={Colors.text.tertiary} />
            {' '}142 Maple St, Toronto
          </Text>
        </View>
        <AnimatedPressable style={styles.notifBtn} haptic onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
          <View style={styles.notifDot} />
        </AnimatedPressable>
      </View>

      {/* Search bar */}
      <AnimatedPressable
        style={styles.searchBar}
        haptic
        onPress={() => navigation.navigate('Search')}
      >
        <Ionicons name="search" size={18} color={Colors.text.tertiary} />
        <Text style={styles.searchPlaceholder}>Search projects, pros, ideas...</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  greetingCol: { flex: 1 },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  name: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
  location: { fontSize: 12, color: Colors.text.tertiary },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: 'rgba(8,10,24,1)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface.default,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: Spacing.md,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: Colors.text.tertiary,
  },
});
