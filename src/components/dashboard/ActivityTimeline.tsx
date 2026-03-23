import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AnimatedPressable } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ActivityItem, FAKE_ACTIVITY } from './data';
import { SectionHeader } from './SectionHeader';
import { useStaggeredEntrance } from './useStaggeredEntrance';

const MAX_ITEMS = 4;

export function ActivityTimeline() {
  const navigation = useNavigation<any>();
  const animatedStyle = useStaggeredEntrance(6);
  const items = FAKE_ACTIVITY.slice(0, MAX_ITEMS);

  const handlePress = (actItem: ActivityItem) => {
    if (actItem.route === 'Messages' && actItem.projectId) {
      const { CHAT_THREADS } = require('./messageData');
      const thread = CHAT_THREADS.find((t: any) => t.projectId === actItem.projectId);
      if (thread) navigation.navigate('Chat', { thread });
      else navigation.navigate('HomeownerTabs', { screen: 'Messages' });
    } else if (actItem.route === 'ProjectDetail' && actItem.projectId) {
      const { PROJECTS_LIST } = require('./data');
      const project = PROJECTS_LIST.find((p: any) => p.id === actItem.projectId);
      if (project) navigation.navigate('ProjectDetailView', { project });
    }
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader title="Recent Activity" />

      <View style={styles.card}>
        {/* Timeline line */}
        {items.length > 1 && (
          <View style={styles.timelineLine} />
        )}

        {items.map((item, i) => (
          <View key={item.id}>
            <AnimatedPressable style={styles.row} haptic onPress={() => handlePress(item)}>
              <View style={[styles.iconCircle, { backgroundColor: item.iconColor + '22' }]}>
                <Ionicons name={item.icon as any} size={16} color={item.iconColor} />
              </View>
              <View style={styles.textCol}>
                <Text style={styles.text} numberOfLines={1}>{item.text}</Text>
                <Text style={styles.time}>{item.time}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} />
            </AnimatedPressable>
            {i < items.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

        {/* View all link */}
        <AnimatedPressable style={styles.viewAll} haptic onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.viewAllText}>View all activity</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    overflow: 'hidden',
  },
  timelineLine: {
    position: 'absolute',
    left: 30,
    top: 24,
    bottom: 60,
    width: 2,
    backgroundColor: Colors.surface.border,
    borderRadius: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  textCol: { flex: 1 },
  text: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    marginBottom: 2,
  },
  time: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 60,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accent,
  },
});
