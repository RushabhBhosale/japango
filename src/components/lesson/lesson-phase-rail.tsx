import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CourseLessonActivitySummary, LessonActivityType } from '@/types/course';

export type LessonPhase = 'Context' | 'Notice' | 'Understand' | 'Build' | 'Apply' | 'Checkpoint';

const phaseOrder: LessonPhase[] = ['Context', 'Notice', 'Understand', 'Build', 'Apply', 'Checkpoint'];

export function phaseForActivity(type: LessonActivityType): LessonPhase {
  if (type === 'introduction' || type === 'warm_up' || type === 'story' || type === 'dialogue' || type === 'reading' || type === 'timed_reading' || type === 'listening') return 'Context';
  if (type === 'vocabulary_intro' || type === 'kanji_intro') return 'Notice';
  if (type === 'grammar_explanation') return 'Understand';
  if (type === 'substitution_drill' || type === 'conjugation_drill' || type === 'sentence_transformation' || type === 'sentence_ordering') return 'Build';
  if (type === 'checkpoint' || type === 'reflection') return 'Checkpoint';
  return 'Apply';
}

/**
 * A compact, predictable lesson sequence: new words → sentence pattern →
 * conversation → controlled A/B/C practice → a short check.
 */
export function learningStepLabel(type: LessonActivityType): string {
  if (type === 'introduction' || type === 'warm_up') return 'Lesson goal';
  if (type === 'vocabulary_intro' || type === 'kanji_intro') return 'New words';
  if (type === 'grammar_explanation') return 'Sentence pattern';
  if (type === 'story' || type === 'dialogue') return 'Conversation';
  if (type === 'vocabulary_practice' || type === 'kanji_practice') return 'Practice A · notice';
  if (type === 'substitution_drill' || type === 'conjugation_drill' || type === 'sentence_transformation') return 'Practice B · build';
  if (type === 'sentence_ordering' || type === 'error_correction' || type === 'mixed_practice' || type === 'sentence_production') return 'Practice C · use';
  if (type === 'reading' || type === 'timed_reading' || type === 'listening' || type === 'dictation' || type === 'shadowing') return 'Practice C · understand';
  if (type === 'checkpoint') return 'Quick check';
  return 'Next step';
}

export function LessonPhaseRail({ activities, activeActivityId, compact = false }: { activities: CourseLessonActivitySummary[]; activeActivityId: string; compact?: boolean }) {
  const theme = useTheme();
  const presentPhases = phaseOrder.filter((phase) => activities.some((activity) => phaseForActivity(activity.type) === phase));
  const activePhase = phaseForActivity(activities.find((activity) => activity.id === activeActivityId)?.type ?? 'introduction');
  const activeIndex = presentPhases.indexOf(activePhase);

  return (
    <View accessibilityLabel={`Lesson phases. Current phase: ${activePhase}.`} style={styles.rail}>
      {presentPhases.map((phase, index) => {
        const completed = index < activeIndex || activities.filter((activity) => phaseForActivity(activity.type) === phase).every((activity) => Boolean(activity.progress.completedAt));
        const current = phase === activePhase;
        return (
          <View key={phase} style={styles.phase}>
            <View style={[styles.line, { backgroundColor: completed || current ? theme.primary : theme.border }]} />
            <ThemedText type="smallBold" themeColor={current ? 'primary' : completed ? 'text' : 'textSecondary'}>{completed ? '✓' : current ? '●' : '○'}{compact ? '' : ` ${phase}`}</ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  phase: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  line: { height: 1, width: 12 },
});
