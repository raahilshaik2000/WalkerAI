import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useHomeownerMessageThreads, type HomeownerMessageThread } from '@/lib/homeowner-data';
import { useSilentFocusRefetch } from '@/lib/silent-focus-refetch';
import { useAuthStore } from '@/stores/auth.store';
import { AnimatedPressable, GlassButton, GradientBackground, ListItemSkeleton } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';

export default function HomeownerMessages() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const threadsQuery = useHomeownerMessageThreads(user?.id);
  useSilentFocusRefetch(threadsQuery.refetch);
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const showSkeleton = !!user?.id && !threadsQuery.data && threadsQuery.isLoading;
  const errorMessage = !user?.id
    ? 'Sign in to view your messages.'
    : threadsQuery.error
      ? formatAppSafeErrorMessage(threadsQuery.error, 'Could not load messages.')
      : null;

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('homeowner-messages-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void threadsQuery.refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadsQuery, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await threadsQuery.refetch();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter(
      (t) => t.contractorName.toLowerCase().includes(q) || t.projectTitle.toLowerCase().includes(q),
    );
  }, [search, threads]);

  const renderThread = ({ item }: { item: HomeownerMessageThread }) => (
    <AnimatedPressable
      style={styles.thread}
      haptic
      onPress={() => navigation.navigate('Chat', {
        projectId: item.projectId,
        contractorName: item.contractorName,
        projectTitle: item.projectTitle,
      })}
    >
      <View style={[styles.avatar, styles.avatarSystem]}>
        <Ionicons name="person" size={18} color={Colors.text.tertiary} />
      </View>

      <View style={styles.threadContent}>
        <Text style={styles.name} numberOfLines={1}>{item.contractorName}</Text>
        <Text style={styles.projectTag} numberOfLines={1}>{item.projectTitle}</Text>
        <Text style={styles.preview} numberOfLines={1}>{item.lastMessage}</Text>
      </View>

      <View style={styles.rightCol}>
        {item.lastMessageTime ? <Text style={styles.time}>{item.lastMessageTime}</Text> : null}
      </View>
    </AnimatedPressable>
  );

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <AnimatedPressable haptic onPress={() => setShowSearch(!showSearch)}>
            <Ionicons name={showSearch ? 'close' : 'search-outline'} size={20} color="#fff" />
          </AnimatedPressable>
        </View>

        {showSearch && (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={Colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor={Colors.text.tertiary}
              value={search}
              onChangeText={setSearch}
              autoFocus
              selectionColor={Colors.accent}
            />
          </View>
        )}

        {showSkeleton ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, index) => (
              <ListItemSkeleton key={`msg-skel-${index}`} style={styles.skeletonItem} />
            ))}
          </View>
        ) : (
          <FlatList
            data={errorMessage ? [] : filtered}
            keyExtractor={(item) => item.projectId}
            renderItem={renderThread}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              errorMessage ? (
                <View style={styles.empty}>
                  <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTitle}>Could not load messages</Text>
                  <Text style={styles.emptySub}>{errorMessage}</Text>
                  <GlassButton label="Try Again" onPress={() => { void threadsQuery.refetch(); }} size="sm" style={{ marginTop: 10 }} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTitle}>No conversations</Text>
                  <Text style={styles.emptySub}>Messages with your contractors, GC, and project participants will appear here once a project is accepted</Text>
                </View>
              )
            }
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
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  skeletonList: { paddingHorizontal: 16, paddingTop: 8 },
  skeletonItem: { marginBottom: 12 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff', padding: 0 },
  list: { paddingBottom: 150 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
  thread: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarSystem: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  threadContent: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 2 },
  projectTag: { fontSize: 11, fontWeight: '600', color: Colors.success, marginBottom: 2 },
  preview: { fontSize: 13, color: Colors.text.tertiary, lineHeight: 18 },
  rightCol: { alignItems: 'flex-end' },
  time: { fontSize: 11, color: Colors.text.tertiary },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
});
