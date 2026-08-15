import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/ai-chat/chat-composer';
import { ChatMessageBubble } from '@/components/ai-chat/chat-message-bubble';
import { ChatThreadHeader } from '@/components/ai-chat/chat-thread-header';
import { TypingIndicator } from '@/components/ai-chat/typing-indicator';
import { LoadingState } from '@/components/common/loading-state';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AiChatClientError, retryYuiMessage, sendYuiMessage } from '@/features/ai-chat/chat-service';
import { getYuiChat } from '@/services/database/ai-chat-repository';
import { useTheme } from '@/hooks/use-theme';
import { getFuriganaPreference } from '@/services/database/japanese-text-repository';
import type { AiChatMessage } from '@/types/ai-chat';

export default function ChatsScreen() {
  const theme = useTheme();
  const listRef = useRef<FlatList<AiChatMessage>>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showFurigana, setShowFurigana] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  const showPendingMessage = useCallback((message: AiChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    scrollToLatest();
  }, [scrollToLatest]);

  const loadChat = useCallback(async () => {
    setErrorMessage(undefined);
    try {
      const [chat, furiganaPreference] = await Promise.all([
        getYuiChat(),
        getFuriganaPreference().catch(() => undefined),
      ]);
      setMessages(chat.messages);
      setShowFurigana(furiganaPreference === 'always');
    } catch {
      setErrorMessage('Yui’s saved conversation could not be opened. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadChat(); }, [loadChat]));
  useEffect(() => { if (messages.length) scrollToLatest(false); }, [messages.length, scrollToLatest]);
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, () => scrollToLatest(false));
    return () => subscription.remove();
  }, [scrollToLatest]);

  const send = useCallback(async () => {
    const value = draft.trim();
    if (!value || sending) return;
    setDraft('');
    setSending(true);
    setErrorMessage(undefined);
    let pendingMessageId: string | undefined;
    try {
      const chat = await sendYuiMessage(value, (message) => {
        pendingMessageId = message.id;
        showPendingMessage(message);
      });
      setMessages(chat.messages);
    } catch (error) {
      setErrorMessage(error instanceof AiChatClientError ? error.message : 'Yui could not reply right now. Your message is saved. Tap it to retry.');
      void getYuiChat()
        .then((chat) => setMessages(chat.messages))
        .catch(() => {
          if (!pendingMessageId) return;
          setMessages((current) => current.map((message) => message.id === pendingMessageId ? { ...message, deliveryStatus: 'failed' } : message));
        });
    } finally {
      setSending(false);
    }
  }, [draft, sending, showPendingMessage]);

  const retry = useCallback(async (messageId: string) => {
    if (sending) return;
    setSending(true);
    setErrorMessage(undefined);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, deliveryStatus: 'pending' } : message));
    try {
      const chat = await retryYuiMessage(messageId);
      setMessages(chat.messages);
    } catch (error) {
      setErrorMessage(error instanceof AiChatClientError ? error.message : 'Yui could not reply right now. Your message is still saved. Tap it to retry.');
      void getYuiChat()
        .then((chat) => setMessages(chat.messages))
        .catch(() => setMessages((current) => current.map((message) => message.id === messageId ? { ...message, deliveryStatus: 'failed' } : message)));
    } finally {
      setSending(false);
    }
  }, [sending]);

  if (loading) {
    return <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.background }]}><LoadingState label="Opening Yui’s chat…" /></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.safe}
      >
        <View style={styles.thread}>
          <ChatThreadHeader
            typing={sending}
            showFurigana={showFurigana}
            onToggleFurigana={() => setShowFurigana((shown) => !shown)}
            onReview={() => router.push('/ai/chat-review' as Href)}
          />
          <FlatList
            ref={listRef}
            accessibilityLabel="Conversation with Yui"
            contentContainerStyle={styles.messageList}
            data={messages}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyExtractor={(message) => message.id}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={sending ? <TypingIndicator /> : <View style={styles.listFooter} />}
            onContentSizeChange={() => scrollToLatest()}
            renderItem={({ item }) => <ChatMessageBubble message={item} showFurigana={showFurigana} onRetry={(messageId) => { void retry(messageId); }} />}
            style={styles.list}
          />
          {errorMessage ? (
            <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.errorSoft, borderColor: theme.error }]}>
              <ThemedText type="small" style={{ color: theme.error }}>{errorMessage}</ThemedText>
            </View>
          ) : null}
          <ChatComposer disabled={sending} onChangeText={setDraft} onSend={() => { void send(); }} value={draft} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  thread: { flex: 1, maxWidth: MaxContentWidth, overflow: 'hidden', alignSelf: 'center', width: '100%' },
  list: { flex: 1 },
  messageList: { flexGrow: 1, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  separator: { height: Spacing.two },
  listFooter: { height: Spacing.two },
  notice: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
