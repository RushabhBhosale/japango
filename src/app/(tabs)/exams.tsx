import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { getMockExams } from '@/features/mock-exam/mock-exam-catalog';
import { useTheme } from '@/hooks/use-theme';
import type { MockExamLevel } from '@/types/mock-exam';

function ExamLevel({ level }: { level: MockExamLevel }) {
  const theme = useTheme();
  const exams = getMockExams(level);
  return (
    <View style={styles.levelSection}>
      <View style={styles.levelTitle}>
        <View style={[styles.levelMark, { borderColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{level}</ThemedText>
        </View>
        <View style={styles.levelCopy}>
          <ThemedText type="section">{level} mock papers</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Full JLPT-style practice</ThemedText>
        </View>
      </View>
      <View style={[styles.examList, { borderColor: theme.border }]}>
        {exams.map((exam, index) => (
          <Pressable
            key={exam.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${level} ${exam.title}`}
            onPress={() => router.push({ pathname: '/exam/[examId]', params: { examId: exam.id } })}
            style={({ pressed }) => [
              styles.examRow,
              index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 },
              { backgroundColor: pressed ? theme.primarySoft : 'transparent' },
            ]}
          >
            <ThemedText type="metadata" style={{ color: theme.primary }}>{exam.title.replace('Mock Exam ', '').padStart(2, '0')}</ThemedText>
            <View style={styles.examCopy}>
              <ThemedText type="cardTitle">{exam.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{exam.placements.length} questions · {exam.timing.totalMinutes ?? 0} minutes</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={21} color={theme.primary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ExamsScreen() {
  const theme = useTheme();
  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.header}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>JLPT practice</ThemedText>
        <ThemedText type="display">Exam room</ThemedText>
        <ThemedText themeColor="textSecondary">A quiet, focused simulation. Furigana, hints, translations, and answers stay hidden until you submit.</ThemedText>
      </View>
      <View style={[styles.examNote, { borderColor: theme.border }]}>
        <Ionicons name="eye-off-outline" size={22} color={theme.primary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.noteCopy}>Your work is saved locally as you move through each paper.</ThemedText>
      </View>
      <ExamLevel level="N5" />
      <ExamLevel level="N4" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.five },
  header: { gap: Spacing.two, maxWidth: 620 },
  examNote: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  noteCopy: { flex: 1, minWidth: 0 },
  levelSection: { gap: Spacing.three },
  levelTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  levelMark: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  levelCopy: { flex: 1, minWidth: 0 },
  examList: { borderBottomWidth: 1, borderTopWidth: 1 },
  examRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 76, minWidth: 0, paddingHorizontal: Spacing.two, paddingVertical: Spacing.three },
  examCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
});
