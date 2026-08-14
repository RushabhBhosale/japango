import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { FuriganaBubble } from '@/components/lesson/furigana-bubble';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getFuriganaPreference, subscribeToFuriganaPreference } from '@/services/database/japanese-text-repository';
import { JapaneseVoiceUnavailableError, speakJapanese } from '@/services/speech/japanese-speech';
import type { AssistanceMode, V3JapaneseLine } from '@/types/lesson-v3';
import type { FuriganaPreference } from '@/types/learning';

const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;

interface V3JapaneseLineProps {
  line: V3JapaneseLine;
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
  type?: ThemedTextProps['type'];
  showAudio?: boolean;
}

export function V3JapaneseLineView({ line, assistanceMode, glossary, type = 'japanese', showAudio = false }: V3JapaneseLineProps) {
  const theme = useTheme();
  const [furiganaPreference, setFuriganaPreference] = useState<FuriganaPreference>('off');
  const [audioError, setAudioError] = useState(false);
  const [openedTokenId, setOpenedTokenId] = useState<string>();
  const [meaningTokenId, setMeaningTokenId] = useState<string>();
  const meaningToken = line.text.tokens.find((token) => token.id === meaningTokenId);
  const meaning = meaningToken?.vocabularyId ? glossary[meaningToken.vocabularyId] : undefined;
  const meaningReading = meaningToken?.reading ?? meaning?.reading;

  useEffect(() => {
    let active = true;
    void getFuriganaPreference().then((preference) => {
      if (active) setFuriganaPreference(preference);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => subscribeToFuriganaPreference(setFuriganaPreference), []);

  const play = async () => {
    setAudioError(false);
    try {
      await speakJapanese(line.text.raw);
    } catch (error) {
      setAudioError(error instanceof JapaneseVoiceUnavailableError || error instanceof Error);
    }
  };

  const handleTokenPress = (tokenId: string, canRevealReading: boolean) => {
    if (!canRevealReading || furiganaPreference === 'always' || openedTokenId === tokenId) {
      setOpenedTokenId(undefined);
      setMeaningTokenId(tokenId);
      return;
    }
    setOpenedTokenId(tokenId);
  };

  return (
    <View style={styles.container}>
      <View style={styles.japaneseRow}>
        <View style={styles.japanese}>
          <View style={styles.tokens}>
            {line.text.tokens.map((token) => {
              const reading = token.reading ?? (token.vocabularyId ? glossary[token.vocabularyId]?.reading : undefined);
              const tokenMeaning = token.vocabularyId ? glossary[token.vocabularyId]?.meaning : undefined;
              const hasHelp = Boolean(reading || tokenMeaning);
              const showFurigana = Boolean(reading) && (furiganaPreference === 'always' || openedTokenId === token.id);
              const underlined = token.kind === 'word' && Boolean(reading) && kanjiPattern.test(token.surface);
              const canRevealReading = Boolean(reading && underlined);
              const showBubble = canRevealReading && showFurigana;
              const accessibilityAction = canRevealReading
                ? showBubble ? 'Open word details.' : 'Show its reading.'
                : 'Open word details.';
              return (
                <Pressable
                  key={token.id}
                  accessibilityRole={hasHelp ? 'button' : undefined}
                  accessibilityLabel={hasHelp ? `${token.surface}${showBubble && reading ? `, ${reading}` : ''}. ${accessibilityAction}` : undefined}
                  disabled={!hasHelp}
                  onPress={() => handleTokenPress(token.id, canRevealReading)}
                  style={({ pressed }) => [styles.token, showBubble && styles.tokenWithBubble, pressed && hasHelp && styles.tokenPressed]}
                >
                  {showBubble && reading ? <FuriganaBubble reading={reading} /> : null}
                  <ThemedText type={type} style={underlined ? [styles.underlinedWord, { textDecorationColor: theme.primary }] : undefined}>{token.surface}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
        {showAudio ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${line.text.raw}`}
            hitSlop={12}
            onPress={() => void play()}
            style={styles.audioButton}
          >
            <Ionicons name="volume-medium-outline" size={20} color={theme.primary} />
          </Pressable>
        ) : null}
      </View>
      {audioError ? <ThemedText type="small" themeColor="textSecondary">A Japanese system voice is not available right now.</ThemedText> : null}
      <Modal visible={Boolean(meaningToken && (meaning || meaningReading))} transparent animationType="fade" onRequestClose={() => setMeaningTokenId(undefined)}>
        <Pressable style={styles.backdrop} onPress={() => setMeaningTokenId(undefined)} accessibilityLabel="Close word meaning">
          <Pressable style={[styles.meaningSheet, { backgroundColor: theme.surface }]} onPress={() => undefined}>
            {meaningToken ? <ThemedText type={type}>{meaningToken.surface}</ThemedText> : null}
            {meaningReading ? <ThemedText type="heading" style={{ color: theme.primary }}>{meaningReading}</ThemedText> : null}
            {meaning ? <ThemedText themeColor="textSecondary">{meaning.meaning}</ThemedText> : null}
            <AppButton label="Close" variant="quiet" onPress={() => setMeaningTokenId(undefined)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  japaneseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 0 },
  japanese: { flex: 1, minWidth: 0 },
  tokens: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', minWidth: 0, rowGap: Spacing.two },
  token: { alignItems: 'center', flexShrink: 1, maxWidth: '100%', minWidth: 0, position: 'relative' },
  tokenPressed: { opacity: 0.7 },
  tokenWithBubble: { zIndex: 10 },
  underlinedWord: { textDecorationLine: 'underline' },
  audioButton: { width: 44, height: 44, alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  meaningSheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, gap: Spacing.two, padding: Spacing.four },
});
