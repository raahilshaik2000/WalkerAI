import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/auth';
import { useAuthStore } from '@/stores/auth.store';
import { Colors } from '@/constants/theme';

export function NotificationButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchUnread = async () => {
      try {
        const activeUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
        if (!activeUserId) {
          if (!cancelled) setUnreadCount(0);
          return;
        }

        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', activeUserId)
          .eq('read', false);
        if (!cancelled) setUnreadCount(count ?? 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    };

    const subscribe = async () => {
      const activeUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
      if (!activeUserId || cancelled) {
        setUnreadCount(0);
        return;
      }

      await fetchUnread();
      if (cancelled) return;

      channel = supabase
        .channel(`notification-button-${activeUserId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${activeUserId}`,
        }, fetchUnread)
        .subscribe();
    };

    subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={() => navigation.navigate('Notifications')}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={22} color={Colors.text.secondary} />
      {unreadCount > 0 ? <View style={styles.dot} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: Colors.accent,
    borderWidth: 1.5,
    borderColor: '#000',
  },
});
