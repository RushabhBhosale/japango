import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getOrCreateDailyHomework } from '@/services/database/daily-homework-repository';
import { subscribeToDailyRollover } from '@/services/daily-rollover';
import type { DailyHomework } from '@/types/daily-homework';

function typeLabel(type: DailyHomework['items'][number]['type']): string {
  if (type === 'vocabulary') return 'Vocabulary';
  if (type === 'kanji') return 'Kanji';
  return 'Grammar';
}

export default function HomeworkScreen() {
  const theme = useTheme();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const [homework, setHomework] = useState<DailyHomework>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setHomework(await getOrCreateDailyHomework());
    } catch {
      setError('Today’s homework could not be opened. Your existing lessons are still available.');
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToDailyRollover(() => { void load(); }), [load]);

  if (!homework && !error) return <ScreenContainer scroll={false}><LoadingState label="Preparing today’s homework…" /></ScreenContainer>;
  if (error) return <ScreenContainer><ThemedText style={{ color: theme.error }}>{error}</ThemedText><AppButton label="Try again" onPress={() => { void load(); }} /></ScreenContainer>;
  if (!homework) return null;

  const complete = homework.completedItemIds.length;
  return (
    <ScreenContainer>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="chevron-back" size={21} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Back</ThemedText>
      </Pressable>
      <View style={styles.heading}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>TODAY · {homework.estimatedMinutes} MIN</ThemedText>
        <ThemedText type="display">Daily homework</ThemedText>
        <ThemedText themeColor="textSecondary">{complete}/{homework.items.length} targets practised today. Your plan stays the same when you come back.</ThemedText>
      </View>
      <Card variant="accent" style={styles.summary}>
        <Ionicons name={complete === homework.items.length ? 'checkmark-circle' : 'sparkles-outline'} size={25} color={theme.primary} />
        <View style={styles.summaryCopy}>
          <ThemedText type="smallBold">{complete === homework.items.length ? 'All set for today.' : 'A short, focused session.'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Weak items, new material, conversation practice, and due reviews are balanced quietly in the background.</ThemedText>
        </View>
      </Card>
      <View style={styles.list}>
        {homework.items.map((item) => {
          const completed = homework.completedItemIds.includes(item.itemId);
          const focused = itemId === item.itemId;
          return (
            <View key={item.id} style={[styles.item, { borderColor: focused ? theme.primary : theme.border, backgroundColor: focused ? theme.primarySoft : theme.surface }]}>
              <View style={styles.itemMain}>
                <View style={[styles.icon, { backgroundColor: completed ? theme.successSoft : theme.backgroundSelected }]}>
                  <Ionicons name={completed ? 'checkmark' : item.type === 'kanji' ? 'brush-outline' : item.type === 'grammar' ? 'git-branch-outline' : 'chatbox-outline'} size={17} color={completed ? theme.success : theme.primary} />
                </View>
                <View style={styles.itemCopy}>
                  <InteractiveJapaneseText
                    type="japanese"
                    contextualReading={item.reading}
                    furiganaOverride
                    interactive={false}
                  >
                    {item.title}
                  </InteractiveJapaneseText>
                  <ThemedText type="small" themeColor="textSecondary">{typeLabel(item.type)} · {item.source.replace('-', ' ')}</ThemedText>
                </View>
              </View>
              {item.meaning ? <ThemedText type="small" themeColor="textSecondary">{item.meaning}</ThemedText> : null}
            </View>
          );
        })}
      </View>
      <AppButton label="Open vocabulary review" onPress={() => router.push('/(tabs)/flashcards')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.half, minHeight: 44, paddingHorizontal: Spacing.one },
  heading: { gap: Spacing.one },
  summary: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two },
  summaryCopy: { flex: 1, gap: Spacing.half },
  list: { gap: Spacing.one },
  item: { borderRadius: Radius.medium, borderWidth: 1, gap: Spacing.one, padding: Spacing.two },
  itemMain: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  icon: { alignItems: 'center', borderRadius: Radius.small, height: 34, justifyContent: 'center', width: 34 },
  itemCopy: { flex: 1, gap: 2 },
});
