import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { LessonV2Question, LessonV2Section as LessonV2SectionData, LessonsV2FuriganaMode } from '@/types/lessons-v2';

import { InteractiveJapaneseText } from './interactive-japanese-text';
import { JlptQuestionCard } from './jlpt-question-card';

interface LessonV2SectionProps {
  section: LessonV2SectionData;
  furiganaMode: LessonsV2FuriganaMode;
  onAnswered: (question: LessonV2Question, choiceId: string, correct: boolean) => void;
}

export function LessonV2Section({ section, furiganaMode, onAnswered }: LessonV2SectionProps) {
  return <View style={{ gap: 12 }}>
    <ThemedText type="heading">{section.title}</ThemedText>
    {section.content.map((content, index) => <View key={`${section.id}-content-${index}`} style={{ gap: 4 }}>
      {content.japanese ? <InteractiveJapaneseText text={content.japanese} furiganaMode={furiganaMode} type="default" /> : null}
      {content.english ? <ThemedText themeColor="textSecondary">{content.english}</ThemedText> : null}
    </View>)}
    {section.questions.map((question) => <JlptQuestionCard key={question.id} question={question} furiganaMode={furiganaMode} onAnswered={onAnswered} />)}
  </View>;
}
