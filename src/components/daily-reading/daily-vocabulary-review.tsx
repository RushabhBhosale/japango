import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JapaneseTextItem } from '@/services/database/japanese-text-repository';
import type { DailyReadingVocabulary } from '@/types/daily-reading';

interface DailyVocabularyReviewProps {
  vocabulary: DailyReadingVocabulary[];
  savedIds: string[];
  furigana: boolean;
  vocabularyItems: JapaneseTextItem[];
  onSave: (id: string) => void;
  onVocabularyPress: (item: JapaneseTextItem) => void;
}

export function DailyVocabularyReview({
  vocabulary,
  savedIds,
  furigana,
  vocabularyItems,
  onSave,
  onVocabularyPress,
}: DailyVocabularyReviewProps) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View>
        <InteractiveJapaneseText type="subtitle" contextualReading="きょうのあたらしいことば">今日の新しい言葉</InteractiveJapaneseText>
        <ThemedText themeColor="textSecondary">New and useful words from today</ThemedText>
      </View>
      <View style={[styles.list, { borderColor: theme.border }]}>
        {vocabulary.map((item, index) => {
          const saved = savedIds.includes(item.sourceItemId);
          return (
            <View key={item.sourceItemId} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <View style={styles.copy}>
                <View style={styles.wordRow}>
                  <InteractiveJapaneseText
                    type="heading"
                    furiganaOverride={furigana}
                    contextualReading={item.reading}
                    additionalItems={vocabularyItems}
                    onItemPress={onVocabularyPress}
                  >{item.word}</InteractiveJapaneseText>
                  {item.isNew ? <View style={[styles.newBadge, { backgroundColor: theme.warningSoft }]}><ThemedText type="smallBold" style={{ color: theme.warning }}>NEW</ThemedText></View> : null}
                </View>
                <View style={styles.meaningRow}>
                  <InteractiveJapaneseText type="small" themeColor="textSecondary">{item.reading}</InteractiveJapaneseText>
                  <ThemedText type="small" themeColor="textSecondary">· {item.meaning}</ThemedText>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? `${item.word} saved for review` : `Save ${item.word} for review`}
                disabled={saved}
                onPress={() => onSave(item.sourceItemId)}
                style={[styles.saveButton, { borderColor: saved ? theme.success : theme.primary, backgroundColor: saved ? theme.successSoft : theme.primarySoft }]}
              >
                <Ionicons name={saved ? 'checkmark' : 'add'} size={19} color={saved ? theme.success : theme.primary} />
                <ThemedText type="smallBold" style={{ color: saved ? theme.success : theme.primary }}>{saved ? 'Saved' : 'Review'}</ThemedText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  list: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: Spacing.two },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minHeight: 78, minWidth: 0, paddingVertical: Spacing.twoHalf },
  copy: { flexBasis: 180, flexGrow: 1, gap: Spacing.one, minWidth: 0 },
  wordRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minWidth: 0 },
  meaningRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  newBadge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  saveButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: Spacing.one, minHeight: 44, paddingHorizontal: 12 },
});
