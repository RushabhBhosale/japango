import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getRecentChatMistakes, markChatMistakeReviewed } from '@/services/database/ai-chat-repository';
import type { ChatMistake } from '@/types/ai-chat';

function ReviewCard({ mistake, onComplete }: { mistake: ChatMistake; onComplete: (id: string) => void }) {
  const theme = useTheme();
  const [retrying, setRetrying] = useState(false);
  const [retry, setRetry] = useState('');
  return (
    <Card style={styles.card}>
      <View style={styles.labelledText}>
        <ThemedText type="metadata" themeColor="textSecondary">You wrote</ThemedText>
        <ThemedText type="japanese">{mistake.original}</ThemedText>
      </View>
      <View style={[styles.correction, { backgroundColor: theme.primarySoft }]}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>More natural</ThemedText>
        <ThemedText type="japanese" style={{ color: theme.primary }}>{mistake.corrected}</ThemedText>
      </View>
      {mistake.explanation ? (
        <View style={styles.labelledText}>
          <ThemedText type="metadata" themeColor="textSecondary">Why</ThemedText>
          <ThemedText>{mistake.explanation}</ThemedText>
        </View>
      ) : null}
      {retrying ? (
        <View style={styles.retryArea}>
          <ThemedText type="small" themeColor="textSecondary">Try writing it once in your own words, then save this review.</ThemedText>
          <TextInput
            accessibilityLabel="Try the corrected Japanese once"
            multiline
            onChangeText={setRetry}
            placeholder="Try it once…"
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.primary}
            style={[styles.retryInput, { borderColor: theme.border, color: theme.text }]}
            value={retry}
          />
          <AppButton disabled={!retry.trim()} label="Save review" onPress={() => onComplete(mistake.id)} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setRetrying(true)} style={({ pressed }) => [styles.tryButton, { backgroundColor: pressed ? theme.backgroundSelected : theme.primarySoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>Try it once</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onComplete(mistake.id)} style={({ pressed }) => [styles.markButton, pressed && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>Mark reviewed</ThemedText>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

export default function ChatReviewScreen() {
  const theme = useTheme();
  const [mistakes, setMistakes] = useState<ChatMistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setMistakes(await getRecentChatMistakes());
    } catch {
      setError('Recent chat reviews could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const complete = useCallback(async (mistakeId: string) => {
    await markChatMistakeReviewed(mistakeId);
    setMistakes((current) => current.filter((mistake) => mistake.id !== mistakeId));
  }, []);

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Finding useful chat notes…" /></ScreenContainer>;

  return (
    <ScreenContainer>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="chevron-back" size={21} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Chat</ThemedText>
      </Pressable>
      <View style={styles.heading}>
        <ThemedText type="metadata" themeColor="primary">Yui’s notes</ThemedText>
        <ThemedText type="display">Review</ThemedText>
        <ThemedText themeColor="textSecondary">A few useful patterns from your recent messages. The conversation stays a conversation.</ThemedText>
      </View>
      {error ? <Card variant="quiet"><ThemedText style={{ color: theme.error }}>{error}</ThemedText><AppButton label="Try again" onPress={() => { void load(); }} variant="secondary" /></Card> : null}
      {mistakes.map((mistake) => <ReviewCard key={mistake.id} mistake={mistake} onComplete={(id) => { void complete(id); }} />)}
      {!error && !mistakes.length ? (
        <Card variant="quiet" style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={28} color={theme.primary} />
          <ThemedText type="heading">Nothing to review right now.</ThemedText>
          <ThemedText themeColor="textSecondary">Keep chatting with Yui. When a pattern is worth revisiting, it will appear here quietly.</ThemedText>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.half, minHeight: 44, paddingHorizontal: Spacing.one },
  heading: { gap: Spacing.two },
  card: { gap: Spacing.three },
  labelledText: { gap: Spacing.one },
  correction: { borderRadius: Radius.medium, gap: Spacing.one, padding: Spacing.twoHalf },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tryButton: { borderRadius: Radius.small, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.twoHalf },
  markButton: { borderRadius: Radius.small, minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.twoHalf },
  retryArea: { gap: Spacing.two },
  retryInput: { borderRadius: Radius.small, borderWidth: 1, fontSize: 16, lineHeight: 23, minHeight: 80, padding: Spacing.twoHalf, textAlignVertical: 'top' },
  empty: { alignItems: 'flex-start', paddingVertical: Spacing.four },
});
