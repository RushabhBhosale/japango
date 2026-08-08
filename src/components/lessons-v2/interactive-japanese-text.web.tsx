import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import type { JapaneseToken, LessonsV2FuriganaMode, StructuredJapaneseText } from '@/types/lessons-v2';

import { WordLookupSheet } from './word-lookup-sheet';

interface InteractiveJapaneseTextProps {
  text: StructuredJapaneseText;
  furiganaMode: LessonsV2FuriganaMode;
  type?: ThemedTextProps['type'];
  onFavorite?: (token: JapaneseToken) => void;
  onMarkForReview?: (token: JapaneseToken) => void;
  glossary?: Record<string, { reading: string; meaning: string }>;
}

function hasKanji(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

/** The web renderer emits ruby/rt for semantic furigana; native uses stacked text. */
export function InteractiveJapaneseText({ text, furiganaMode, type = 'japanese', onFavorite, onMarkForReview, glossary }: InteractiveJapaneseTextProps) {
  const [selected, setSelected] = useState<JapaneseToken>();
  return (
    <>
      <View accessibilityLabel={text.raw} style={styles.line}>
        {text.tokens.map((token) => token.kind === 'word' ? (
          <Pressable key={token.id} accessibilityRole="button" accessibilityLabel={`${token.surface}. Open word details.`} onPress={() => setSelected(token)}>
            {furiganaMode === 'always' && token.reading && hasKanji(token.surface)
              ? <ruby><span>{token.surface}</span><rt>{token.reading}</rt></ruby>
              : <ThemedText type={type} style={styles.surface}>{token.surface}</ThemedText>}
          </Pressable>
        ) : <ThemedText key={token.id} type={type}>{token.surface}</ThemedText>)}
      </View>
      <WordLookupSheet token={selected} visible={Boolean(selected)} onClose={() => setSelected(undefined)} onFavorite={onFavorite} onMarkForReview={onMarkForReview} gloss={selected?.vocabularyId ? glossary?.[selected.vocabularyId] : undefined} />
    </>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap' },
  surface: { fontWeight: '700', textDecorationLine: 'underline' },
});
