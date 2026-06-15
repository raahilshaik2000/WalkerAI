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
import { useNavigation, useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
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

export default function GeneralContractorMessagesScreen() {
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
      setErrorMessage('Project is missing. Reopen messages from the GC project page.');
      return;
    }

    const load = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, body, sender_id, sent_at, attachment_url')
        .eq('project_id', projectId)
        .order('sent_at', { ascending: true });
      if (error) {
        setErrorMessage(`Could not load messages: ${error.message}`);
        return;
      }
      setErrorMessage(null);
      setMessages((data ?? []) as Message[]);
    };
    load();

    const channel = supabase
      .channel(`gc-messages:${projectId}`)
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

    const { error } = await supabase.from('messages').insert({
      project_id: projectId,
      sender_id: user.id,
      body: trimmed,
    });

    if (error) {
      setBody(trimmed);
      Alert.alert('Message not sent', error.message);
    } else {
      ReactNativeHapticFeedback.trigger('impactLight');
    }
    setSending(false);
  };

  const openAttachment = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open attachment', 'Please try again in a moment.');
    }
  };

  return (
    <GradientBackground glow="none">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Project Messages</Text>
              <Text style={styles.subtitle}>Homeowner, GC, trades, and suppliers</Text>
            </View>
            <View style={styles.headerSide} />
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={styles.list}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={36} color={Colors.text.tertiary} />
                <Text style={styles.emptyText}>{errorMessage ?? 'No messages yet.'}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.sender_id === user?.id;
              return (
                <View style={isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem}>
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
                            color={isMe ? Colors.accentFg : Colors.text.secondary}
                          />
                          <Text style={[styles.attachmentText, isMe ? styles.attachmentTextMe : styles.attachmentTextThem]}>
                            View attachment
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.timestamp, isMe ? styles.timestampMe : styles.timestampThem]}>
                    {new Date(item.sent_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
          />

          <View style={styles.compose}>
            <TextInput
              style={styles.input}
              value={body}
              onChangeText={setBody}
              placeholder="Type a message..."
              placeholderTextColor={Colors.text.tertiary}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!body.trim() || sending}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up" size={20} color={Colors.accentFg} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
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
  headerSide: { width: 48 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { ...Typography.h3 },
  subtitle: { ...Typography.caption, marginTop: 2 },
  list: { padding: Spacing.sm, paddingBottom: 16, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMe: { color: Colors.accentFg },
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
  attachmentTextMe: { color: Colors.accentFg },
  attachmentTextThem: { color: Colors.text.secondary },
  bubbleWrapMe: { alignSelf: 'flex-end', maxWidth: '78%', marginBottom: 8 },
  bubbleWrapThem: { alignSelf: 'flex-start', maxWidth: '78%', marginBottom: 8 },
  timestamp: { fontSize: 11, color: Colors.text.tertiary, marginTop: 3 },
  timestampMe: { alignSelf: 'flex-end', marginRight: 4 },
  timestampThem: { alignSelf: 'flex-start', marginLeft: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { ...Typography.bodySecondary, textAlign: 'center' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    gap: 10,
    backgroundColor: Colors.bg.primary,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
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
  sendBtnDisabled: { opacity: 0.4 },
});
