import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { ChatThread, ChatMessage, CHAT_MESSAGES } from '@/components/dashboard/messageData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_ACTIONS = [
  { icon: 'camera-outline', label: 'Photo' },
  { icon: 'attach-outline', label: 'File' },
  { icon: 'cash-outline', label: 'Payment' },
  { icon: 'calendar-outline', label: 'Schedule' },
];

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getUniqueDates(messages: ChatMessage[]): Set<string> {
  return new Set(messages.map((m) => m.date));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const thread: ChatThread = route.params?.thread;
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_MESSAGES[thread.id] ?? []);
  const [text, setText] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const listRef = useRef<FlatList>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'me',
      senderName: 'You',
      text: text.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date().toISOString().split('T')[0],
      type: 'text',
      status: 'sent',
    };
    setMessages((prev) => [...prev, newMsg]);
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleQuickAction = (label: string) => {
    Alert.alert(label, `${label} sharing coming soon.`);
  };

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollBtn(distanceFromBottom > 200);
  }, []);

  // Group messages by date for rendering
  const renderData = React.useMemo(() => {
    const result: (ChatMessage | { type: 'date_separator'; date: string; label: string })[] = [];
    let lastDate = '';
    for (const msg of messages) {
      if (msg.date !== lastDate) {
        result.push({ type: 'date_separator', date: msg.date, label: formatDateLabel(msg.date) });
        lastDate = msg.date;
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  const isFirstInGroup = (index: number, item: ChatMessage) => {
    if (index === 0) return true;
    const prev = renderData[index - 1];
    if (!('sender' in prev)) return true;
    return prev.sender !== item.sender;
  };

  const isLastInGroup = (index: number, item: ChatMessage) => {
    if (index === renderData.length - 1) return true;
    const next = renderData[index + 1];
    if (!('sender' in next)) return true;
    return next.sender !== item.sender;
  };

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    // Date separator
    if (item.type === 'date_separator') {
      return (
        <View style={styles.dateSeparator}>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{item.label}</Text>
          </View>
        </View>
      );
    }

    const msg = item as ChatMessage;

    // System message
    if (msg.type === 'system') {
      return (
        <View style={styles.systemRow}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.text.tertiary} />
          <Text style={styles.systemText}>{msg.text}</Text>
        </View>
      );
    }

    const isMe = msg.sender === 'me';
    const first = isFirstInGroup(index, msg);
    const last = isLastInGroup(index, msg);

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, !first && { marginTop: 2 }]}>
        {/* Avatar (contractor only, first in group) */}
        {!isMe && (
          <View style={styles.avatarCol}>
            {first && msg.senderAvatar ? (
              <Image source={{ uri: msg.senderAvatar }} style={styles.msgAvatar} />
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}

        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem,
          first && !isMe && styles.bubbleThemFirst,
          first && isMe && styles.bubbleMeFirst,
        ]}>
          {/* Image message */}
          {msg.type === 'image' && msg.imageUrl && (
            <Image source={{ uri: msg.imageUrl }} style={styles.imageMsg} />
          )}

          {/* Text */}
          {msg.text.length > 0 && (
            <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{msg.text}</Text>
          )}

          {/* Time + status (last in group only) */}
          {last && (
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, isMe && styles.timeTextMe]}>{msg.time}</Text>
              {isMe && msg.status && (
                <Ionicons
                  name={msg.status === 'read' ? 'checkmark-done' : msg.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={msg.status === 'read' ? '#60A5FA' : isMe ? 'rgba(0,0,0,0.35)' : Colors.text.tertiary}
                />
              )}
            </View>
          )}
        </View>
      </View>
    );
  }, [renderData]);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>

          <View style={styles.headerCenter}>
            {thread.contractorAvatar ? (
              <View style={styles.headerAvatarWrap}>
                <Image source={{ uri: thread.contractorAvatar }} style={styles.headerAvatar} />
                {thread.isOnline && <View style={styles.headerOnline} />}
              </View>
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarSystem]}>
                <Ionicons name="headset-outline" size={16} color="#fff" />
              </View>
            )}
            <View>
              <Text style={styles.headerName}>{thread.contractorName}</Text>
              <Text style={styles.headerProject}>{thread.projectTitle}</Text>
            </View>
          </View>

          <AnimatedPressable onPress={() => {}} haptic>
            <Ionicons name="call-outline" size={20} color={Colors.text.tertiary} />
          </AnimatedPressable>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Messages */}
          <FlatList
            ref={listRef}
            data={renderData}
            keyExtractor={(item: any) => item.id ?? item.date}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onScroll={handleScroll}
            scrollEventThrottle={100}
          />

          {/* Scroll to bottom FAB */}
          {showScrollBtn && (
            <AnimatedPressable
              style={styles.scrollFab}
              haptic
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            >
              <Ionicons name="chevron-down" size={18} color="#fff" />
            </AnimatedPressable>
          )}

          {/* Composer */}
          <SafeAreaView edges={['bottom']} style={styles.composerSafe}>
            {/* Quick actions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              {QUICK_ACTIONS.map((a) => (
                <AnimatedPressable key={a.label} style={styles.quickPill} haptic onPress={() => handleQuickAction(a.label)}>
                  <Ionicons name={a.icon as any} size={14} color={Colors.text.secondary} />
                  <Text style={styles.quickLabel}>{a.label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>

            {/* Input */}
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
                style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                haptic
                onPress={handleSend}
                disabled={!text.trim()}
              >
                <Ionicons name="send" size={16} color={text.trim() ? '#000' : Colors.text.tertiary} />
              </AnimatedPressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surface.border,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarSystem: { backgroundColor: Colors.surface.hover, alignItems: 'center', justifyContent: 'center' },
  headerOnline: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: Colors.bg.primary,
  },
  headerName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  headerProject: { fontSize: 11, color: Colors.text.tertiary },

  // Messages
  list: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 4 },

  // Date separator
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
  datePill: { backgroundColor: Colors.surface.default, paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.pill },
  dateText: { fontSize: 11, fontWeight: '600', color: Colors.text.tertiary },

  // System message
  systemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginVertical: 8, paddingHorizontal: 20,
  },
  systemText: { fontSize: 12, color: Colors.text.tertiary, textAlign: 'center' },

  // Message row
  msgRow: { flexDirection: 'row', marginBottom: 2, paddingHorizontal: 4 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  avatarCol: { width: 28, marginRight: 6 },
  msgAvatar: { width: 24, height: 24, borderRadius: 12, marginTop: 2 },
  avatarSpacer: { width: 24 },

  // Bubble
  bubble: { maxWidth: '75%', borderRadius: 18, padding: 10, paddingBottom: 6 },
  bubbleMe: { backgroundColor: '#FFFFFF', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.surface.default, borderBottomLeftRadius: 4 },
  bubbleMeFirst: { borderTopRightRadius: 18 },
  bubbleThemFirst: { borderTopLeftRadius: 18 },

  msgText: { fontSize: 15, color: '#fff', lineHeight: 21 },
  msgTextMe: { color: '#000' },

  imageMsg: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  timeText: { fontSize: 10, color: Colors.text.tertiary },
  timeTextMe: { color: 'rgba(0,0,0,0.35)' },

  // Scroll FAB
  scrollFab: {
    position: 'absolute', right: 16, bottom: 130,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface.default, borderWidth: 1, borderColor: Colors.surface.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Composer
  composerSafe: { backgroundColor: Colors.bg.primary },
  quickRow: { gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  quickPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.default, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  quickLabel: { fontSize: 11, fontWeight: '500', color: Colors.text.secondary },
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
});
