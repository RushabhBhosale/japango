import { View } from 'react-native';

import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/themed-text';
import type { LessonV2Explanation, LessonsV2FuriganaMode } from '@/types/lessons-v2';

import { InteractiveJapaneseText } from './interactive-japanese-text';

export function AnswerExplanation({ explanation, furiganaMode }: { explanation: LessonV2Explanation; furiganaMode: LessonsV2FuriganaMode }) {
  return <Card><View style={{ gap: 8 }}>
    <ThemedText type="smallBold">WHY THIS ANSWER WORKS</ThemedText>
    {explanation.correct.japanese ? <InteractiveJapaneseText text={explanation.correct.japanese} furiganaMode={furiganaMode} type="default" /> : null}
    {explanation.correct.english ? <ThemedText themeColor="textSecondary">{explanation.correct.english}</ThemedText> : null}
    {explanation.commonMistake?.english ? <ThemedText type="small" themeColor="textSecondary">Common mistake: {explanation.commonMistake.english}</ThemedText> : null}
  </View></Card>;
}
