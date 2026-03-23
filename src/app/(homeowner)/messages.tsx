import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { CHAT_THREADS, ChatThread } from '@/components/dashboard/messageData';

export default function HomeownerMessages() {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const totalUnread = CHAT_THREADS.reduce((s, t) => s + t.unreadCount, 0);

  const filtered = useMemo(
    () => {
      if (!search.trim()) return CHAT_THREADS;
      const q = search.toLowerCase();
      return CHAT_THREADS.filter(
        (t) => t.contractorName.toLowerCase().includes(q) || t.projectTitle.toLowerCase().includes(q),
      );
    },
    [search],
  );

  const renderThread = ({ item }: { item: ChatThread }) => {
    const hasUnread = item.unreadCount > 0;

    return (
      <AnimatedPressable
        style={styles.thread}
        haptic
        onPress={() => navigation.navigate('Chat', { thread: item })}
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {item.contractorAvatar ? (
            <Image source={{ uri: item.contractorAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarSystem]}>
              <Ionicons name={item.isSystem ? 'headset-outline' : 'person'} size={18} color={Colors.text.tertiary} />
            </View>
          )}
          {item.isOnline && <View style={styles.onlineDot} />}
        </View>

        {/* Content */}
        <View style={styles.threadContent}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>
              {item.contractorName}
            </Text>
            {!item.isSystem && (
              <Ionicons name="checkmark-circle" size={12} color="#22C55E" style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={[styles.projectPill, { backgroundColor: item.projectStatusColor + '18' }]}>
            <Text style={[styles.projectPillText, { color: item.projectStatusColor }]}>
              {item.projectTitle}
            </Text>
          </View>
          <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>

        {/* Right column */}
        <View style={styles.rightCol}>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>{item.lastMessageTime}</Text>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Messages</Text>
            {totalUnread > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{totalUnread}</Text>
              </View>
            )}
          </View>
          <AnimatedPressable haptic onPress={() => setShowSearch(!showSearch)}>
            <Ionicons name={showSearch ? 'close' : 'search-outline'} size={20} color="#fff" />
          </AnimatedPressable>
        </View>

        {/* Search */}
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
            {search.length > 0 && (
              <AnimatedPressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Thread list */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderThread}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No conversations</Text>
              <Text style={styles.emptySub}>Start a project to connect with contractors</Text>
            </View>
          }
        />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface.default, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#fff', padding: 0 },

  // List
  list: { paddingBottom: 150 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },

  // Thread
  thread: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarSystem: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: Colors.bg.primary,
  },

  threadContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '500', color: '#fff' },
  nameUnread: { fontWeight: '700' },
  projectPill: {
    alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: Radius.pill, marginBottom: 3,
  },
  projectPillText: { fontSize: 10, fontWeight: '600' },
  preview: { fontSize: 13, color: Colors.text.tertiary, lineHeight: 18 },
  previewUnread: { color: Colors.text.secondary },

  rightCol: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: 11, color: Colors.text.tertiary },
  timeUnread: { color: Colors.text.secondary, fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Empty
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: Colors.text.tertiary },
});
