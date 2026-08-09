import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/card';
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
      <View style={styles.levelTitle}><ThemedText type="heading">{level}</ThemedText><ThemedText type="small" themeColor="textSecondary">Full JLPT-style mock papers</ThemedText></View>
      {exams.map((exam) => (
        <Pressable key={exam.id} accessibilityRole="button" accessibilityLabel={`Open ${level} ${exam.title}`} onPress={() => router.push({ pathname: '/exam/[examId]', params: { examId: exam.id } })} style={({ pressed }) => [styles.examRow, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && { backgroundColor: theme.primarySoft }]}>
          <View style={styles.examNumber}><ThemedText type="smallBold" style={{ color: theme.primary }}>{exam.title.replace('Mock Exam ', '')}</ThemedText></View>
          <View style={styles.examCopy}><ThemedText style={styles.examTitle}>{exam.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{exam.placements.length} questions · {exam.timing.totalMinutes ?? 0} minutes</ThemedText></View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

export default function ExamsScreen() {
  return (
    <ScreenContainer contentStyle={styles.screen}>
      <Card><ThemedText type="smallBold" themeColor="primary">JLPT PRACTICE</ThemedText><ThemedText type="title">Mock exams</ThemedText><ThemedText themeColor="textSecondary">Exam mode keeps translations, furigana, hints, and answers hidden until you submit.</ThemedText></Card>
      <ExamLevel level="N5" />
      <ExamLevel level="N4" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four },
  levelSection: { gap: Spacing.two },
  levelTitle: { gap: Spacing.half },
  examRow: { alignItems: 'center', borderWidth: 1, borderRadius: Radius.medium, flexDirection: 'row', gap: Spacing.two, minHeight: 76, padding: Spacing.three },
  examNumber: { alignItems: 'center', backgroundColor: '#ECE6F6', borderRadius: Radius.pill, height: 36, justifyContent: 'center', width: 36 },
  examCopy: { flex: 1, gap: Spacing.half },
  examTitle: { fontWeight: 700 },
});
