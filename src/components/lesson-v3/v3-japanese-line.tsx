import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { InteractiveJapaneseText } from '@/components/lessons-v2/interactive-japanese-text';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { JapaneseVoiceUnavailableError, speakJapanese } from '@/services/speech/japanese-speech';
import type { AssistanceMode, V3JapaneseLine } from '@/types/lesson-v3';

interface V3JapaneseLineProps {
  line: V3JapaneseLine;
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
  type?: ThemedTextProps['type'];
  showAudio?: boolean;
}

export function V3JapaneseLineView({ line, assistanceMode, glossary, type = 'japanese', showAudio = false }: V3JapaneseLineProps) {
  const theme = useTheme();
  // Assistance changes furigana and response support, never whether a story
  // line is translated by default. The learner stays in Japanese first and
  // can reveal meaning only when it is useful.
  const [helpRevealed, setHelpRevealed] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const play = async () => {
    setAudioError(false);
    try {
      await speakJapanese(line.text.raw);
    } catch (error) {
      setAudioError(error instanceof JapaneseVoiceUnavailableError || error instanceof Error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.japaneseRow}>
        <View style={styles.japanese}>
          <InteractiveJapaneseText
            text={line.text}
            furiganaMode={assistanceMode === 'guided' ? 'always' : 'hidden'}
            glossary={glossary}
            type={type}
          />
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
      {line.englishHelp && helpRevealed ? <ThemedText type="small" themeColor="textSecondary">{line.englishHelp}</ThemedText> : null}
      {line.englishHelp && !helpRevealed ? (
        <Pressable accessibilityRole="button" onPress={() => setHelpRevealed(true)} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>Show meaning</ThemedText>
        </Pressable>
      ) : null}
      {audioError ? <ThemedText type="small" themeColor="textSecondary">A Japanese system voice is not available right now.</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  japaneseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  japanese: { flex: 1, minWidth: 0 },
  audioButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
