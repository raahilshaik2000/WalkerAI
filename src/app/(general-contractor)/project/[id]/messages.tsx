import { useCallback, useEffect, useRef, useState } from 'react';
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
import { launchImageLibrary } from 'react-native-image-picker';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { GENERAL_CONTRACTOR_READINESS_SELECT, isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';

interface Message {
  id: string;
  body: string | null;
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
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(user?.id ?? null);
  const [canSendMessages, setCanSendMessages] = useState(false);
  const [composeLockMessage, setComposeLockMessage] = useState('Checking message access...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const clearMessageState = useCallback((lockMessage: string, currentUser: string | null = null) => {
    setMessages([]);
    setBody('');
    setSending(false);
    setUploadingAttachment(false);
    setCurrentUserId(currentUser);
    setCanSendMessages(false);
    setComposeLockMessage(lockMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      setErrorMessage('Project is missing. Reopen messages from the GC project page.');
      clearMessageState('Project is missing. Reopen messages from the GC project page.');
      return;
    }

    const load = async () => {
      try {
        const currentUser = user ?? (await supabase.auth.getUser()).data.user;
        if (!currentUser?.id) {
          if (!cancelled) {
            setErrorMessage('You need to be signed in to view project messages.');
            clearMessageState('Sign in to send project messages.');
          }
          return;
        }
        setCurrentUserId(currentUser.id);

        const [messageResult, gcResult] = await Promise.all([
          supabase
            .from('messages')
            .select('id, body, sender_id, sent_at, attachment_url')
            .eq('project_id', projectId)
            .order('sent_at', { ascending: true }),
          supabase
            .from('general_contractors')
            .select(GENERAL_CONTRACTOR_READINESS_SELECT)
            .eq('user_id', currentUser.id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (messageResult.error) {
          setErrorMessage(`Could not load messages: ${formatAppSafeErrorMessage(messageResult.error, 'Please try again.')}`);
          clearMessageState('Messages are unavailable right now. Try again shortly.', currentUser.id);
          return;
        } else {
          setErrorMessage(null);
          setMessages((messageResult.data ?? []) as Message[]);
        }

        if (gcResult.error || !gcResult.data?.id) {
          setCanSendMessages(false);
          setComposeLockMessage('GC profile is required before project messages can be sent.');
          return;
        }

        const { data: assignment, error: assignmentError } = await supabase
          .from('general_contractor_projects')
          .select('status')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gcResult.data.id)
          .in('status', ['invited', 'active', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (assignmentError || !assignment) {
          setCanSendMessages(false);
          setComposeLockMessage('GC project assignment is required before messages can be sent.');
          return;
        }

        if (!isGeneralContractorReadyForProjectControls(gcResult.data)) {
          setCanSendMessages(false);
          setComposeLockMessage('Complete verified GC setup is required before GC project messages can be sent.');
          return;
        }

        if (!['invited', 'active'].includes(assignment.status)) {
          setCanSendMessages(false);
          setComposeLockMessage('This project message thread is read-only for completed GC assignments.');
          return;
        }

        setCanSendMessages(true);
        setComposeLockMessage('');
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load messages.'));
          clearMessageState('Messages are unavailable right now. Try again shortly.');
        }
      }
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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [clearMessageState, projectId, user]);

  const sendMessage = async () => {
    if (!body.trim() || sending) return;
    if (!canSendMessages) {
      Alert.alert('Messages locked', composeLockMessage || 'Project messages are currently read-only.');
      return;
    }
    let trimmed = '';
    try {
      const currentUser = user ?? (await supabase.auth.getUser()).data.user;
      if (!projectId || !currentUser?.id) {
        Alert.alert('Unable to send', 'Please reopen this project and try again.');
        return;
      }
      setSending(true);
      trimmed = body.trim();
      setBody('');

      const { error } = await supabase.from('messages').insert({
        project_id: projectId,
        sender_id: currentUser.id,
        body: trimmed,
      });
      if (error) throw error;
      ReactNativeHapticFeedback.trigger('impactLight');
    } catch (err) {
      if (trimmed) setBody(trimmed);
      Alert.alert('Message not sent', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const sendPhotoAttachment = async () => {
    if (sending || uploadingAttachment) return;
    if (!canSendMessages) {
      Alert.alert('Messages locked', composeLockMessage || 'Project messages are currently read-only.');
      return;
    }

    try {
      const currentUser = user ?? (await supabase.auth.getUser()).data.user;
      if (!projectId || !currentUser?.id) {
        Alert.alert('Unable to attach photo', 'Please reopen this project and try again.');
        return;
      }
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      });
      if (result.didCancel || !result.assets?.[0]) return;

      const caption = body.trim();
      setUploadingAttachment(true);
      const upload = getUploadMetadata(result.assets[0]);
      const path = `${projectId}/messages/${currentUser.id}-${Date.now()}.${upload.extension}`;
      const { publicUrl } = await uploadFile('project-photos', path, upload.uri, upload.contentType);

      const { error } = await supabase.from('messages').insert({
        project_id: projectId,
        sender_id: currentUser.id,
        body: caption || null,
        attachment_url: publicUrl,
      });
      if (error) throw error;

      if (caption) setBody('');
      ReactNativeHapticFeedback.trigger('impactLight');
    } catch (err) {
      Alert.alert('Attachment not sent', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUploadingAttachment(false);
    }
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
              const isMe = item.sender_id === currentUserId;
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
            {!!composeLockMessage && (
              <Text style={styles.composeLock}>{composeLockMessage}</Text>
            )}
            <TextInput
              style={styles.input}
              value={body}
              onChangeText={setBody}
              placeholder={canSendMessages ? 'Type a message...' : 'Messages locked'}
              placeholderTextColor={Colors.text.tertiary}
              editable={canSendMessages && !sending && !uploadingAttachment}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.attachBtn, (!canSendMessages || sending || uploadingAttachment) && styles.sendBtnDisabled]}
              onPress={sendPhotoAttachment}
              disabled={!canSendMessages || sending || uploadingAttachment}
              activeOpacity={0.85}
            >
              <Ionicons name={uploadingAttachment ? 'cloud-upload-outline' : 'image-outline'} size={20} color={Colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!canSendMessages || !body.trim() || sending || uploadingAttachment) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!canSendMessages || !body.trim() || sending || uploadingAttachment}
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
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
    backgroundColor: Colors.bg.primary,
  },
  composeLock: { ...Typography.caption, color: Colors.warning, marginBottom: 8 },
  input: {
    flex: 1,
    color: Colors.text.primary,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 22,
    paddingLeft: 52,
    paddingRight: 58,
    paddingVertical: 11,
    fontSize: 15,
    maxHeight: 120,
  },
  attachBtn: {
    position: 'absolute',
    left: Spacing.sm,
    bottom: Spacing.sm,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    position: 'absolute',
    right: Spacing.sm,
    bottom: Spacing.sm,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
