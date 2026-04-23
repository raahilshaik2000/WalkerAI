import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { AnimatedPressable } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { SectionHeader } from './SectionHeader';
import { useStaggeredEntrance } from './useStaggeredEntrance';

interface NotificationRow {
  id: string;
  type: string;
  payload: Record<string, any>;
  created_at: string;
}

const TYPE_META: Record<string, { icon: string; color: string; label: (p: any) => string }> = {
  quote_submitted:   { icon: 'document-text-outline', color: '#F59E0B', label: () => 'New quote received from contractor' },
  quote_approved:    { icon: 'checkmark-circle-outline', color: '#34D399', label: () => 'Quote approved — project is active' },
  milestone_completed: { icon: 'flag-outline', color: '#60A5FA', label: (p) => `Milestone completed — approve to release payment` },
  job_dispatched:    { icon: 'send-outline', color: '#A78BFA', label: () => 'Your job was dispatched to contractors' },
  payment_released:  { icon: 'cash-outline', color: '#34D399', label: () => 'Payment released to contractor' },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const MAX_ITEMS = 4;

export function ActivityTimeline() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const animatedStyle = useStaggeredEntrance(6);
  const [items, setItems] = useState<NotificationRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('notifications')
      .select('id, type, payload, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS)
      .then(({ data }) => setItems(data ?? []));
  }, [user]);

  const handlePress = (item: NotificationRow) => {
    const projectId = item.payload?.project_id;
    if (projectId) {
      navigation.navigate('ProjectDetailView', { project: { id: projectId } });
    }
  };

  if (items.length === 0) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <SectionHeader title="Recent Activity" />

      <View style={styles.card}>
        {items.length > 1 && <View style={styles.timelineLine} />}

        {items.map((item, i) => {
          const meta = TYPE_META[item.type] ?? { icon: 'notifications-outline', color: Colors.accent, label: () => item.type };
          return (
            <View key={item.id}>
              <AnimatedPressable style={styles.row} haptic onPress={() => handlePress(item)}>
                <View style={[styles.iconCircle, { backgroundColor: meta.color + '22' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.text} numberOfLines={1}>{meta.label(item.payload)}</Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} />
              </AnimatedPressable>
              {i < items.length - 1 && <View style={styles.divider} />}
            </View>
          );
        })}

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
