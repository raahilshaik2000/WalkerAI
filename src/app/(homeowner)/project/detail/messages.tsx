import React, { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GradientBackground } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { MESSAGES, FakeMessage } from '@/components/dashboard/projectDetailData';

export default function DetailMessagesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = route.params?.projectId ?? 'f1';
  const [messages, setMessages] = useState<FakeMessage[]>(MESSAGES[projectId] ?? []);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    const newMsg: FakeMessage = {
      id: `msg-${Date.now()}`,
      sender: 'me',
      senderName: 'You',
      text: text.trim(),
      time: 'Just now',
    };
    setMessages((prev) => [...prev, newMsg]);
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderMessage = ({ item }: { item: FakeMessage }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
        <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
        <Text style={[styles.time, isMe && styles.timeMe]}>{item.time}</Text>
      </View>
    );
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable onPress={() => navigation.goBack()} haptic>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubble-outline" size={40} color={Colors.text.tertiary} />
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
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
                style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                haptic
                onPress={handleSend}
                disabled={!text.trim()}
              >
                <Ionicons name="send" size={18} color={text.trim() ? '#000' : Colors.text.tertiary} />
              </AnimatedPressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  list: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#FFFFFF', borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: Colors.surface.default, borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '600', color: Colors.text.tertiary, marginBottom: 3 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  msgTextMe: { color: '#000' },
  time: { fontSize: 10, color: Colors.text.tertiary, marginTop: 4, alignSelf: 'flex-end' },
  timeMe: { color: 'rgba(0,0,0,0.4)' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 14, color: Colors.text.tertiary },
  composerSafe: { backgroundColor: Colors.bg.primary },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.surface.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surface.default,
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.surface.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#fff', maxHeight: 100,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.surface.default },
});
