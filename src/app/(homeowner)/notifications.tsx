import { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, ListItemSkeleton } from '@/components/ui';

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

const TYPE_META: Record<string, { icon: string; title: string }> = {
  job_accepted: { icon: '🎉', title: 'Contractor accepted your project' },
  quote_submitted: { icon: '📄', title: 'Your quote is ready' },
  milestone_needs_approval: { icon: '✅', title: 'Milestone complete — approval needed' },
  milestone_paid: { icon: '💰', title: 'Milestone payment released' },
  project_complete: { icon: '🏆', title: 'Project complete!' },
  dispute_raised: { icon: '⚠️', title: 'Dispute opened' },
  dispatch_no_match: { icon: '📡', title: 'Expanding contractor search' },
  warranty_expiring: { icon: '📋', title: 'Warranty expiring soon' },
  new_message: { icon: '💬', title: 'New message' },
  job_dispatched: { icon: '⚡', title: 'New job available' },
  job_filled: { icon: '📭', title: 'Job taken' },
  quote_approved: { icon: '✅', title: 'Quote approved' },
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, payload, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifications(data ?? []);
      setLoading(false);
    };

    fetchNotifications();

    const channel = supabase
      .channel('user-notifications')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handlePress = async (notification: Notification) => {
    if (!notification.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
      setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
    }
    const deepLink = notification.payload?.deep_link as string;
    // deep link navigation - TODO
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', user!.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={styles.markAllRead}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.list}>
            {Array.from({ length: 5 }).map((_, i) => (
              <ListItemSkeleton key={i} style={{ marginBottom: 8 }} />
            ))}
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySub}>You're all caught up!</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: n }) => {
              const meta = TYPE_META[n.type] ?? { icon: '🔔', title: n.type };
              return (
                <TouchableOpacity
                  style={[styles.notifRow, !n.read && styles.notifRowUnread]}
                  onPress={() => handlePress(n)}
                  activeOpacity={0.85}
                >
                  <View style={styles.notifIcon}>
                    <Text style={styles.notifIconText}>{meta.icon}</Text>
                  </View>
                  <View style={styles.notifContent}>
                    <Text style={styles.notifTitle}>{meta.title}</Text>
                    {!!n.payload?.message && (
                      <Text style={styles.notifBody} numberOfLines={2}>
                        {String(n.payload.message)}
                      </Text>
                    )}
                    <Text style={styles.notifTime}>{timeAgo(n.created_at)}</Text>
                  </View>
                  {!n.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
  },
  title: { ...Typography.h1 },
  markAllRead: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xl },
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: Radius.item, marginBottom: 6,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
  },
  notifRowUnread: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
  },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.glass.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  notifIconText: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTitle: { ...Typography.h3, marginBottom: 4 },
  notifBody: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: 4 },
  notifTime: { ...Typography.caption },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, marginTop: 6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary },
});
