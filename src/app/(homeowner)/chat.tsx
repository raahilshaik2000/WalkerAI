import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { getRequiredStringParam } from '@/lib/navigation-params';

interface DBMessage {
  id: string;
  project_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  attachment_url: string | null;
}

type RenderItem =
  | DBMessage
  | { type: 'date_separator'; date: string; label: string };

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(iso: string): string {
  return iso.split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'projectId');
  const { contractorName, projectTitle } = route.params ?? {};

  const { user } = useAuthStore();
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    if (!projectId) {
      setMessages([]);
      setErrorMessage('Project is missing. Reopen this chat from Messages.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('messages')
      .select('id, project_id, sender_id, body, sent_at, attachment_url')
      .eq('project_id', projectId)
      .order('sent_at', { ascending: true });

    if (error) {
      setMessages([]);
      setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load messages.'));
      setLoading(false);
      return;
    }

    setMessages((data as DBMessage[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadMessages();

    if (!projectId) return;

    const channel = supabase
      .channel(`chat-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const incoming = payload.new as DBMessage;
          setMessages((prev) => prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadMessages, projectId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    if (!user || !projectId) {
      Alert.alert('Unable to send', 'Please reopen this chat and try again.');
      return;
    }
    const body = text.trim();
    setText('');
    setSending(true);

    // Append optimistically — realtime delivery isn't guaranteed, so don't rely
    // on it to show the message we just sent.
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ project_id: projectId, sender_id: user.id, body })
      .select('id, project_id, sender_id, body, sent_at, attachment_url')
      .single();
    if (error) {
      setText(body);
      Alert.alert('Message not sent', formatAppSafeErrorMessage(error, 'Please try again.'));
    } else if (inserted) {
      const sent = inserted as DBMessage;
      setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  const openAttachment = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open attachment', 'Please try again in a moment.');
    }
  }, []);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollBtn(distanceFromBottom > 200);
  }, []);

  const renderData = React.useMemo<RenderItem[]>(() => {
    const result: RenderItem[] = [];
    let lastDate = '';
    for (const msg of messages) {
      const d = toDateStr(msg.sent_at);
      if (d !== lastDate) {
        result.push({ type: 'date_separator', date: d, label: formatDateLabel(d) });
        lastDate = d;
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  const isFirstInGroup = useCallback((index: number, item: DBMessage) => {
    if (index === 0) return true;
    const prev = renderData[index - 1];
    if (!('sender_id' in prev)) return true;
    return prev.sender_id !== item.sender_id;
  }, [renderData]);

  const isLastInGroup = useCallback((index: number, item: DBMessage) => {
    if (index === renderData.length - 1) return true;
    const next = renderData[index + 1];
    if (!('sender_id' in next)) return true;
    return next.sender_id !== item.sender_id;
  }, [renderData]);

  const renderItem = useCallback(({ item, index }: { item: RenderItem; index: number }) => {
    if ('type' in item && item.type === 'date_separator') {
      return (
        <View style={styles.dateSeparator}>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const msg = item as DBMessage;
    const isMe = msg.sender_id === user?.id;
    const first = isFirstInGroup(index, msg);
    const last = isLastInGroup(index, msg);

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, !first && { marginTop: 2 }]}>
        {!isMe && (
          <View style={styles.avatarCol}>
            {first ? (
              <View style={[styles.msgAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={12} color={Colors.text.tertiary} />
              </View>
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}

        <View style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          first && !isMe && styles.bubbleThemFirst,
          first && isMe && styles.bubbleMeFirst,
        ]}>
          {!!msg.body && <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{msg.body}</Text>}
          {!!msg.attachment_url && (
            <AnimatedPressable
              style={[styles.attachmentCard, isMe ? styles.attachmentCardMe : styles.attachmentCardThem]}
              onPress={() => openAttachment(msg.attachment_url!)}
              haptic
            >
              <Image source={{ uri: msg.attachment_url }} style={styles.attachmentImage} resizeMode="cover" />
              <View style={styles.attachmentFooter}>
                <Ionicons
                  name="image-outline"
                  size={15}
                  color={isMe ? '#000' : Colors.text.secondary}
                />
                <Text style={[styles.attachmentText, isMe ? styles.attachmentTextMe : styles.attachmentTextThem]}>
                  View attachment
                </Text>
              </View>
            </AnimatedPressable>
          )}
          {last && (
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{formatTime(msg.sent_at)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [isFirstInGroup, isLastInGroup, openAttachment, user]);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>

          <View style={styles.headerCenter}>
            <View style={[styles.headerAvatar, styles.headerAvatarSystem]}>
              <Ionicons name="headset-outline" size={16} color="#fff" />
            </View>
            <View>
              <Text style={styles.headerName}>{contractorName ?? 'Contractor'}</Text>
              <Text style={styles.headerProject}>{projectTitle ?? 'Project'}</Text>
            </View>
          </View>

          <View style={{ width: 22 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            data={errorMessage ? [] : renderData}
            keyExtractor={(item: any) => item.id ?? item.date}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            ListEmptyComponent={
              <View style={styles.empty}>
                {loading ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : errorMessage ? (
                  <>
                    <Ionicons name="alert-circle-outline" size={40} color={Colors.text.tertiary} />
                    <Text style={styles.emptyText}>{errorMessage}</Text>
                    <GlassButton label="Try Again" onPress={loadMessages} size="sm" style={{ marginTop: 10 }} />
                  </>
                ) : (
                  <>
                    <Ionicons name="chatbubbles-outline" size={40} color={Colors.text.tertiary} />
                    <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
                  </>
                )}
              </View>
            }
          />

          {showScrollBtn && (
            <AnimatedPressable
              style={styles.scrollFab}
              haptic
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            >
              <Ionicons name="chevron-down" size={18} color="#fff" />
            </AnimatedPressable>
          )}

          <SafeAreaView edges={['bottom']} style={styles.composerSafe}>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor={Colors.text.tertiary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
                selectionColor={Colors.accent}
              />
              <AnimatedPressable
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                haptic
                onPress={handleSend}
                disabled={!text.trim() || sending}
              >
                <Ionicons name="send" size={16} color={text.trim() && !sending ? '#000' : Colors.text.tertiary} />
              </AnimatedPressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surface.border,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarSystem: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  headerProject: { fontSize: 11, color: Colors.text.tertiary },

  list: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 4 },

  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  datePill: { backgroundColor: Colors.surface.default, paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.pill },
  dateText: { fontSize: 11, fontWeight: '600', color: Colors.text.tertiary },

  msgRow: { flexDirection: 'row', marginBottom: 2, paddingHorizontal: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  avatarCol: { width: 28, marginRight: 6 },
  msgAvatar: { width: 24, height: 24, borderRadius: 12, marginTop: 2 },
  avatarPlaceholder: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  avatarSpacer: { width: 24 },

  bubble: { maxWidth: '75%', borderRadius: 18, padding: 10, paddingBottom: 6 },
  bubbleMe: { backgroundColor: '#FFFFFF', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.surface.default, borderBottomLeftRadius: 4 },
  bubbleMeFirst: { borderTopRightRadius: 18 },
  bubbleThemFirst: { borderTopLeftRadius: 18 },

  msgText: { fontSize: 15, color: '#fff', lineHeight: 21 },
  msgTextMe: { color: '#000' },
  attachmentCard: {
    width: 220,
    maxWidth: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  attachmentCardMe: { backgroundColor: 'rgba(0,0,0,0.06)' },
  attachmentCardThem: { backgroundColor: Colors.bg.secondary },
  attachmentImage: { width: '100%', height: 150, backgroundColor: Colors.bg.secondary },
  attachmentFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  attachmentText: { fontSize: 13, fontWeight: '600' },
  attachmentTextMe: { color: '#000' },
  attachmentTextThem: { color: Colors.text.secondary },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timeText: { fontSize: 10, color: Colors.text.tertiary },
  timeTextMe: { color: 'rgba(0,0,0,0.35)' },

  scrollFab: {
    position: 'absolute', right: 16, bottom: 90,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border,
    alignItems: 'center', justifyContent: 'center',
  },

  composerSafe: { backgroundColor: Colors.bg.primary },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.surface.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surface.default,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#fff', maxHeight: 100,
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.surface.default },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.text.tertiary },
});
