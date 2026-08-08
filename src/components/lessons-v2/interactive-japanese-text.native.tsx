import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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

export function InteractiveJapaneseText({ text, furiganaMode, type = 'japanese', onFavorite, onMarkForReview, glossary }: InteractiveJapaneseTextProps) {
  const [selected, setSelected] = useState<JapaneseToken>();
  return (
    <>
      <View accessibilityLabel={text.raw} style={styles.line}>
        {text.tokens.map((token) => token.kind === 'word' ? (
          <Pressable key={token.id} accessibilityRole="button" accessibilityLabel={`${token.surface}${token.reading ? `, ${token.reading}` : ''}. Open word details.`} onPress={() => setSelected(token)} style={styles.word}>
            {furiganaMode === 'always' && token.reading ? <ThemedText type="small" style={styles.reading}>{token.reading}</ThemedText> : null}
            <ThemedText type={type} style={styles.surface}>{token.surface}</ThemedText>
          </Pressable>
        ) : <ThemedText key={token.id} type={type}>{token.surface}</ThemedText>)}
      </View>
      <WordLookupSheet token={selected} visible={Boolean(selected)} onClose={() => setSelected(undefined)} onFavorite={onFavorite} onMarkForReview={onMarkForReview} gloss={selected?.vocabularyId ? glossary?.[selected.vocabularyId] : undefined} />
    </>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  word: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 1 },
  reading: { fontSize: 11, lineHeight: 13, marginBottom: -Spacing.half },
  surface: { fontWeight: '700', textDecorationLine: 'underline' },
});
