import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
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
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

interface Message {
  id: string;
  body: string;
  sender_id: string;
  sent_at: string;
}

export default function CompanyMessagesScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, body, sender_id, sent_at')
        .eq('project_id', projectId)
        .order('sent_at', { ascending: true });
      setMessages(data ?? []);
    };
    load();

    const channel = supabase
      .channel(`company-messages:${projectId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
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
    setSending(true);
    const trimmed = body.trim();
    setBody('');
    try {
      await supabase.from('messages').insert({
        project_id: projectId,
        sender_id: user!.id,
        body: trimmed,
      });
      ReactNativeHapticFeedback.trigger('impactLight');
    } catch {
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <GradientBackground glow="none">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 48 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Messages</Text>
            <View style={{ width: 48 }} />
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const isMe = item.sender_id === user?.id;
              return (
                <View style={isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, isMe ? { color: Colors.accentFg } : { color: Colors.text.primary }]}>
                      {item.body}
                    </Text>
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
              style={[styles.input, { color: Colors.text.primary }]}
              value={body}
              onChangeText={setBody}
              placeholder="Type a message…"
              placeholderTextColor={Colors.text.tertiary}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!body.trim() || sending}
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.glass.border,
  },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h3 },
  list: { padding: Spacing.sm, paddingBottom: 16, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleMe: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleWrapMe: { alignSelf: 'flex-end', maxWidth: '78%', marginBottom: 8 },
  bubbleWrapThem: { alignSelf: 'flex-start', maxWidth: '78%', marginBottom: 8 },
  timestamp: { fontSize: 11, color: Colors.text.tertiary, marginTop: 3 },
  timestampMe: { alignSelf: 'flex-end', marginRight: 4 },
  timestampThem: { alignSelf: 'flex-start', marginLeft: 4 },
  compose: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.glass.border,
    gap: 10, backgroundColor: Colors.bg.primary,
  },
  input: {
    flex: 1, backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, maxHeight: 120,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
