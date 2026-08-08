import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AssistanceMode, V3ChatMessage } from '@/types/lesson-v3';

import { V3JapaneseLineView } from './v3-japanese-line';

interface V3ChatProps {
  messages: V3ChatMessage[];
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
}

function ChatBubble({ message, assistanceMode, glossary }: Omit<V3ChatProps, 'messages'> & { message: V3ChatMessage }) {
  const theme = useTheme();
  const isLearner = message.sender === 'learner';
  const name = message.sender === 'unknown' ? 'Unknown' : message.sender === 'yuki' ? 'ゆき' : 'You';

  return (
    <View style={[styles.messageRow, isLearner && styles.learnerRow]}>
      {!isLearner ? (
        <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{message.sender === 'unknown' ? '?' : 'ゆ'}</ThemedText>
        </View>
      ) : null}
      <View style={styles.bubbleColumn}>
        <ThemedText type="small" themeColor="textSecondary" style={isLearner ? styles.learnerName : undefined}>{name}</ThemedText>
        <View style={[styles.bubble, { backgroundColor: isLearner ? theme.primarySoft : theme.surface, borderColor: isLearner ? theme.primary : theme.border }]}>
          <V3JapaneseLineView line={message.line} assistanceMode={assistanceMode} glossary={glossary} showAudio={!isLearner} />
        </View>
        {message.time ? <ThemedText type="small" themeColor="textSecondary">{message.time}</ThemedText> : null}
      </View>
    </View>
  );
}

export function V3Chat({ messages, assistanceMode, glossary }: V3ChatProps) {
  return (
    <View style={styles.chat}>
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} assistanceMode={assistanceMode} glossary={glossary} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { width: '100%', gap: Spacing.three },
  messageRow: { width: '94%', flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  learnerRow: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  bubbleColumn: { flex: 1, minWidth: 0, gap: Spacing.one },
  learnerName: { textAlign: 'right' },
  bubble: { borderWidth: 1, borderRadius: Radius.large, paddingHorizontal: Spacing.three, paddingVertical: 12 },
});
