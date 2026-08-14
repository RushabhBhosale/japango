import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DailyReadingHomeState, DailyReadingType } from '@/types/daily-reading';

const typeLabels: Record<DailyReadingType, string> = {
  'slice-of-life': 'Slice of life',
  conversation: 'Conversation',
  diary: 'Diary',
  travel: 'Travel',
  mystery: 'Mini mystery',
  'school-work': 'School & work',
  'fictional-news': 'Simple news',
  culture: 'Japanese culture',
  'story-episode': 'Story episode',
};

interface DailyReadingCardProps {
  state?: DailyReadingHomeState;
  loading: boolean;
  errorMessage?: string;
  onOpen: () => void;
  onRetry: () => void;
}

export function DailyReadingCard({ state, loading, errorMessage, onOpen, onRetry }: DailyReadingCardProps) {
  const theme = useTheme();
  const reading = state?.reading;
  const progress = state?.progress;
  const answered = progress?.answers.length ?? 0;
  const correct = progress?.answers.filter((answer) => answer.correct).length ?? 0;
  const completed = Boolean(progress?.completedAt);
  const onPress = reading ? onOpen : onRetry;
  const status = completed
    ? `${correct}/${reading?.questions.length ?? 0} correct`
    : answered
      ? `${answered}/${reading?.questions.length ?? 0} answered`
      : reading
        ? `${reading.questions.length} questions`
        : loading
          ? 'Preparing today’s reading…'
          : 'Try loading again';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reading ? `Open today’s reading, ${reading.title}` : 'Try loading today’s reading again'}
      disabled={loading && !reading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: completed ? theme.successSoft : theme.primarySoft }]}>
        <Ionicons name={completed ? 'checkmark' : 'book-outline'} size={22} color={completed ? theme.success : theme.primary} />
      </View>

      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <InteractiveJapaneseText type="smallBold" contextualReading="きょうのどっかい">今日の読解</InteractiveJapaneseText>
          <ThemedText type="metadata" themeColor="textSecondary">Daily reading</ThemedText>
        </View>
        {reading ? (
          <>
            <InteractiveJapaneseText type="cardTitle" contextualReading={reading.titleReading}>{reading.title}</InteractiveJapaneseText>
            <View style={styles.metaRow}>
              <ThemedText type="small" themeColor="textSecondary">{reading.level} · {typeLabels[reading.type]} · {status}</ThemedText>
              <View style={styles.streak} accessibilityLabel={`${state?.streak ?? 0} day reading streak`}>
                <Ionicons name="flame-outline" size={16} color={theme.warning} />
                <ThemedText type="smallBold" style={{ color: theme.warning }}>{state?.streak ?? 0}</ThemedText>
              </View>
            </View>
          </>
        ) : (
          <ThemedText themeColor="textSecondary">{errorMessage ?? status}</ThemedText>
        )}
      </View>

      {loading && !reading ? (
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
      ) : (
        <Ionicons name="chevron-forward" size={22} color={theme.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: Spacing.twoHalf,
    minHeight: 92,
    minWidth: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.three,
  },
  icon: { alignItems: 'center', borderRadius: Radius.medium, height: 48, justifyContent: 'center', width: 48 },
  copy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  eyebrowRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minWidth: 0 },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', minWidth: 0 },
  streak: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: Spacing.half },
});
