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
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
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
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleText, isMe ? { color: '#fff' } : { color: Colors.text.primary }]}>
                    {item.body}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.glass.border,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h3 },
  list: { padding: Spacing.sm, paddingBottom: 16, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
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
