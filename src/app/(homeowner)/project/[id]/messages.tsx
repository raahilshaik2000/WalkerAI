import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

interface Message {
  id: string;
  body: string;
  sender_id: string;
  sent_at: string;
  attachment_url: string | null;
}

export default function MessagesScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen messages from the project page.');
      return;
    }

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, body, sender_id, sent_at, attachment_url')
          .eq('project_id', projectId)
          .order('sent_at', { ascending: true });
        if (error) {
          setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load messages.'));
          return;
        }
        setErrorMessage(null);
        setMessages(data ?? []);
      } catch (err) {
        setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load messages.'));
      }
    };
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`messages:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `project_id=eq.${projectId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const sendMessage = async () => {
    if (!body.trim() || sending) return;
    if (!projectId || !user?.id) {
      Alert.alert('Unable to send', 'Please reopen this project and try again.');
      return;
    }
    setSending(true);
    const trimmed = body.trim();
    setBody('');

    try {
      const { error } = await supabase.from('messages').insert({
        project_id: projectId,
        sender_id: user.id,
        body: trimmed,
      });
      if (error) throw error;
      ReactNativeHapticFeedback.trigger('impactLight');
    } catch (err) {
      setBody(trimmed); // restore on error
      Alert.alert('Message not sent', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const openAttachment = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open attachment', 'Please try again in a moment.');
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    const timeStr = new Date(item.sent_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!!item.body && (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.body}
          </Text>
        )}
        {!!item.attachment_url && (
          <TouchableOpacity
            style={[styles.attachmentCard, isMe ? styles.attachmentCardMe : styles.attachmentCardThem]}
            onPress={() => openAttachment(item.attachment_url!)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: item.attachment_url }} style={styles.attachmentImage} resizeMode="cover" />
            <View style={styles.attachmentFooter}>
              <Ionicons
                name="image-outline"
                size={15}
                color={isMe ? '#FFFFFF' : Colors.text.secondary}
              />
              <Text style={[styles.attachmentText, isMe ? styles.attachmentTextMe : styles.attachmentTextThem]}>
                View attachment
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <Text style={[styles.timeText, isMe ? styles.timeTextMe : {}]}>{timeStr}</Text>
      </View>
    );
  };

  return (
    <GradientBackground glow="none">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Messages</Text>
            <View style={{ width: 48 }} />
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messageList}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>
                  {errorMessage ?? 'No messages yet. Start the conversation!'}
                </Text>
              </View>
            }
          />

          {/* Compose */}
          <View style={styles.compose}>
            <TextInput
              style={[styles.input, { color: Colors.text.primary }]}
              value={body}
              onChangeText={setBody}
              placeholder="Type a message…"
              placeholderTextColor={Colors.text.tertiary}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!body.trim() || sending}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h3 },
  messageList: { padding: Spacing.sm, paddingBottom: 16, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMe: { color: '#FFFFFF' },
  bubbleTextThem: { color: Colors.text.primary },
  attachmentCard: {
    width: 220,
    maxWidth: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  attachmentCardMe: { backgroundColor: 'rgba(255,255,255,0.16)' },
  attachmentCardThem: { backgroundColor: Colors.bg.secondary },
  attachmentImage: { width: '100%', height: 150, backgroundColor: Colors.bg.secondary },
  attachmentFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  attachmentText: { fontSize: 13, fontWeight: '600' },
  attachmentTextMe: { color: '#FFFFFF' },
  attachmentTextThem: { color: Colors.text.secondary },
  timeText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'right' },
  timeTextMe: { color: 'rgba(255,255,255,0.6)' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...Typography.bodySecondary, textAlign: 'center' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    gap: 10,
    backgroundColor: Colors.bg.primary,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
