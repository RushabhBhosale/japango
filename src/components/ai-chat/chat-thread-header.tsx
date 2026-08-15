import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';
import { ChatAvatar } from './chat-avatar';

interface ChatThreadHeaderProps {
  typing: boolean;
  showFurigana: boolean;
  onToggleFurigana: () => void;
  onReview: () => void;
}

export function ChatThreadHeader({ typing, showFurigana, onToggleFurigana, onReview }: ChatThreadHeaderProps) {
  const theme = useTheme();
  return (
    <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <ChatAvatar online />
      <View style={styles.copy}>
        <ThemedText type="cardTitle">ゆい</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{typing ? 'typing…' : 'online'}</ThemedText>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: showFurigana }}
        accessibilityLabel="Show furigana in chat messages"
        hitSlop={4}
        onPress={onToggleFurigana}
        style={({ pressed }) => [styles.furiganaButton, { backgroundColor: showFurigana ? theme.primarySoft : theme.backgroundElement, borderColor: showFurigana ? theme.primary : theme.border }, pressed && styles.pressed]}
      >
        <ThemedText type="smallBold" style={{ color: showFurigana ? theme.primary : theme.textSecondary }}>ふり</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Review recent corrections"
        hitSlop={8}
        onPress={onReview}
        style={({ pressed }) => [styles.reviewButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.primarySoft }]}
      >
        <Ionicons name="book-outline" size={19} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Review</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 72, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  copy: { flex: 1, minWidth: 0 },
  furiganaButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: Spacing.one },
  reviewButton: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: Spacing.one, justifyContent: 'center', minHeight: 44, paddingHorizontal: Spacing.twoHalf },
  pressed: { opacity: 0.74 },
});
