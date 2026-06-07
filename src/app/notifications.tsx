import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { notificationDisplayMeta } from '@/lib/notifications/meta';
import { navigateToNotification } from '@/lib/notifications/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, ListItemSkeleton } from '@/components/ui';

interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

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
  const { user, role } = useAuthStore();
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
    if (!user?.id) {
      setNotifications([]);
      setErrorMessage('Sign in to view notifications.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'initial') setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, payload, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setNotifications([]);
      setErrorMessage(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setNotifications((data as Notification[] | null) ?? []);
    setErrorMessage(null);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();

    if (!user?.id) return;

    const channel = supabase
      .channel('user-notifications')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
        setErrorMessage(null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifications, user?.id]);

  const handlePress = async (notification: Notification) => {
    if (!notification.read) {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
      if (error) {
        setErrorMessage(error.message);
      } else {
        setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
      }
    }

    navigateToNotification(navigation, notification.type, notification.payload, role);
  };

  const markAllRead = async () => {
    if (!user?.id) {
      setErrorMessage('Sign in to update notifications.');
      return;
    }

    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setErrorMessage(null);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={styles.markAllRead}>Mark all read</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {loading ? (
          <View style={styles.list}>
            {Array.from({ length: 5 }).map((_, i) => (
              <ListItemSkeleton key={i} style={{ marginBottom: 8 }} />
            ))}
          </View>
        ) : (
          <FlatList
            data={errorMessage ? [] : notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={[styles.list, (errorMessage || notifications.length === 0) && styles.listEmpty]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotifications('refresh')} tintColor={Colors.accent} />}
            ListEmptyComponent={
              errorMessage ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>!</Text>
                  <Text style={styles.emptyTitle}>Could not load notifications</Text>
                  <Text style={styles.emptySub}>{errorMessage}</Text>
                  <GlassButton label="Try Again" onPress={() => fetchNotifications()} size="sm" style={{ marginTop: 8 }} />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔔</Text>
                  <Text style={styles.emptyTitle}>No notifications</Text>
                  <Text style={styles.emptySub}>You're all caught up.</Text>
                </View>
              )
            }
            renderItem={({ item: n }) => {
              const meta = notificationDisplayMeta(n.type);
              return (
                <TouchableOpacity
                  style={[styles.notifRow, !n.read && styles.notifRowUnread]}
                  onPress={() => handlePress(n)}
                  activeOpacity={0.85}
                >
                  <View style={styles.notifIcon}>
                    <Text style={styles.notifIconText}>{meta.emoji}</Text>
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
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  backText: { color: Colors.text.primary, fontSize: 31, lineHeight: 33, marginTop: -2 },
  title: { ...Typography.h1, flex: 1, marginLeft: 12 },
  headerSpacer: { width: 92 },
  markAllRead: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xl },
  listEmpty: { flexGrow: 1 },
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: Radius.item, marginBottom: 6,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
  },
  notifRowUnread: {
    backgroundColor: 'rgba(255, 107, 0, 0.06)',
    borderColor: 'rgba(255, 107, 0, 0.2)',
  },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.glass.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  notifIconText: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTitle: { ...Typography.h3, marginBottom: 4, textTransform: 'capitalize' },
  notifBody: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: 4 },
  notifTime: { ...Typography.caption },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, marginTop: 6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.lg },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center' },
});
