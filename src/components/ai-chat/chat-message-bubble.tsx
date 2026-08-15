import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AiChatMessage } from '@/types/ai-chat';

import { InteractiveJapaneseText } from '../lesson/japanese-text';
import { ThemedText } from '../themed-text';

interface ChatMessageBubbleProps {
  message: AiChatMessage;
  showFurigana?: boolean;
  onRetry?: (messageId: string) => void;
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function ChatMessageBubble({ message, showFurigana = false, onRetry }: ChatMessageBubbleProps) {
  const theme = useTheme();
  const learner = message.role === 'learner';
  const failed = message.deliveryStatus === 'failed';
  const bubble = (
    <View style={[
      styles.bubble,
      learner ? { backgroundColor: theme.primary, borderBottomRightRadius: Radius.small } : { backgroundColor: theme.surface, borderColor: theme.border, borderBottomLeftRadius: Radius.small, borderWidth: 1 },
      failed && { backgroundColor: theme.errorSoft, borderColor: theme.error, borderWidth: 1 },
    ]}>
      {showFurigana ? (
        <InteractiveJapaneseText
          selectable
          contextualReading={message.contentReading}
          furiganaDisplay="inline"
          furiganaOverride
          interactive={false}
          style={[styles.message, { color: learner && !failed ? theme.onPrimary : theme.text }]}
        >{message.content}</InteractiveJapaneseText>
      ) : <ThemedText selectable style={[styles.message, { color: learner && !failed ? theme.onPrimary : theme.text }]}>{message.content}</ThemedText>}
      <View style={styles.metadata}>
        {failed ? <Ionicons name="alert-circle-outline" size={14} color={theme.error} /> : null}
        {message.deliveryStatus === 'pending' ? <Ionicons name="time-outline" size={14} color={learner ? theme.onPrimary : theme.textSecondary} /> : null}
        <ThemedText type="small" style={{ color: failed ? theme.error : learner ? theme.onPrimary : theme.textSecondary }}>
          {failed ? 'Tap to retry' : message.deliveryStatus === 'pending' ? 'Sending…' : timeLabel(message.createdAt)}
        </ThemedText>
      </View>
    </View>
  );

  if (failed && onRetry) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message failed to send. Retry: ${message.content}`}
        onPress={() => onRetry(message.id)}
        style={({ pressed }) => [styles.row, learner ? styles.learnerRow : styles.characterRow, pressed && styles.pressed]}
      >
        {bubble}
      </Pressable>
    );
  }
  return <View accessibilityLabel={`${learner ? 'You' : 'Yui'}: ${message.content}`} style={[styles.row, learner ? styles.learnerRow : styles.characterRow]}>{bubble}</View>;
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, width: '100%' },
  learnerRow: { alignItems: 'flex-end' },
  characterRow: { alignItems: 'flex-start' },
  bubble: { borderRadius: Radius.medium, gap: Spacing.one, maxWidth: '84%', minWidth: 0, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  message: { fontSize: 16, lineHeight: 24 },
  metadata: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: Spacing.half },
  pressed: { opacity: 0.76 },
});
