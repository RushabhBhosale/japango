import { useState } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/themed-text';
import type { LessonV2Question, LessonsV2FuriganaMode } from '@/types/lessons-v2';

import { AnswerExplanation } from './answer-explanation';
import { InteractiveJapaneseText } from './interactive-japanese-text';

interface JlptQuestionCardProps { question: LessonV2Question; furiganaMode: LessonsV2FuriganaMode; onAnswered?: (question: LessonV2Question, choiceId: string, correct: boolean) => void; }

export function JlptQuestionCard({ question, furiganaMode, onAnswered }: JlptQuestionCardProps) {
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>();
  const selected = question.choices.find((choice) => choice.id === selectedChoiceId);
  const submitted = Boolean(selected);
  return <Card><View style={{ gap: 12 }}>
    <ThemedText type="smallBold">{question.section.replaceAll('_', ' ').toUpperCase()}</ThemedText>
    <InteractiveJapaneseText text={question.instruction} furiganaMode={furiganaMode} type="small" />
    {question.passage ? <InteractiveJapaneseText text={question.passage} furiganaMode={furiganaMode} type="default" /> : null}
    <InteractiveJapaneseText text={question.prompt} furiganaMode={furiganaMode} type="default" />
    {question.choices.map((choice, index) => <AppButton key={choice.id} label={`${index + 1}. ${choice.label.japanese?.raw ?? choice.label.english ?? ''}`} variant={selectedChoiceId === choice.id ? 'primary' : 'secondary'} disabled={submitted} onPress={() => { setSelectedChoiceId(choice.id); onAnswered?.(question, choice.id, choice.isCorrect); }} />)}
    {submitted ? <>
      <ThemedText type="smallBold" themeColor={selected?.isCorrect ? 'success' : 'error'}>{selected?.isCorrect ? 'Correct' : 'Not quite'}</ThemedText>
      <AnswerExplanation explanation={question.explanation} furiganaMode={furiganaMode} />
    </> : null}
  </View></Card>;
}
