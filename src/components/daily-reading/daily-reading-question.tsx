import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { QuestionOption } from '@/components/quiz/question-option';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JapaneseTextItem } from '@/services/database/japanese-text-repository';
import type { DailyReadingAnswer, DailyReadingQuestion } from '@/types/daily-reading';

interface DailyReadingQuestionViewProps {
  number: number;
  question: DailyReadingQuestion;
  answer?: DailyReadingAnswer;
  furigana: boolean;
  vocabularyItems: JapaneseTextItem[];
  onVocabularyPress: (item: JapaneseTextItem) => void;
  onSubmit: (selectedAnswer: number) => Promise<void>;
}

export function DailyReadingQuestionView({
  number,
  question,
  answer,
  furigana,
  vocabularyItems,
  onVocabularyPress,
  onSubmit,
}: DailyReadingQuestionViewProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">QUESTION {number}</ThemedText>
      <InteractiveJapaneseText
        type="heading"
        furiganaOverride={furigana}
        contextualReading={question.questionReading}
        additionalItems={vocabularyItems}
        onItemPress={onVocabularyPress}
      >{question.question}</InteractiveJapaneseText>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {question.options.map((option, index) => {
          const correctness = answer
            ? index === question.correctAnswer ? 'correct' : index === answer.selectedAnswer ? 'incorrect' : undefined
            : undefined;
          return (
            <QuestionOption
              key={`${question.id}-${index}`}
              label={option}
              selected={(answer?.selectedAnswer ?? selected) === index}
              disabled={Boolean(answer) || submitting}
              correctness={correctness}
              furiganaOverride={furigana}
              contextualReading={question.optionReadings[index]}
              additionalItems={vocabularyItems}
              onItemPress={onVocabularyPress}
              onPress={() => setSelected(index)}
            />
          );
        })}
      </View>
      {!answer ? (
        <AppButton
          label="Submit answer"
          disabled={selected === undefined || submitting}
          onPress={() => {
            if (selected === undefined) return;
            setSubmitting(true);
            void onSubmit(selected).finally(() => setSubmitting(false));
          }}
        />
      ) : (
        <View style={[styles.feedback, { backgroundColor: answer.correct ? theme.successSoft : theme.errorSoft }]}>
          <View style={styles.feedbackHeading}>
            <Ionicons name={answer.correct ? 'checkmark-circle' : 'close-circle'} size={22} color={answer.correct ? theme.success : theme.error} />
            <ThemedText type="smallBold" style={{ color: answer.correct ? theme.success : theme.error }}>
              {answer.correct ? 'Correct' : 'Not quite'}
            </ThemedText>
          </View>
          {!answer.correct ? (
            <View style={styles.correctAnswer}>
              <ThemedText type="small" themeColor="textSecondary">Correct answer</ThemedText>
              <InteractiveJapaneseText contextualReading={question.optionReadings[question.correctAnswer]} furiganaOverride={furigana} additionalItems={vocabularyItems} onItemPress={onVocabularyPress}>
                {question.options[question.correctAnswer]}
              </InteractiveJapaneseText>
            </View>
          ) : null}
          <InteractiveJapaneseText contextualReading={question.explanationReading} themeColor="textSecondary" furiganaOverride={furigana} additionalItems={vocabularyItems} onItemPress={onVocabularyPress}>
            {question.explanation}
          </InteractiveJapaneseText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, gap: Spacing.three, minWidth: 0, paddingTop: Spacing.four },
  options: { gap: Spacing.two },
  feedback: { borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  feedbackHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  correctAnswer: { gap: Spacing.one },
});
