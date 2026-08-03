import { Modal, Pressable, StyleSheet } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JapaneseToken } from '@/types/lessons-v2';

interface WordLookupSheetProps {
  token?: JapaneseToken;
  visible: boolean;
  onClose: () => void;
  onFavorite?: (token: JapaneseToken) => void;
  onMarkForReview?: (token: JapaneseToken) => void;
}

/** V2 lookup is based on authored token links, never heuristic text matching. */
export function WordLookupSheet({ token, visible, onClose, onFavorite, onMarkForReview }: WordLookupSheetProps) {
  const theme = useTheme();
  const dependencyType = token?.vocabularyId ? 'Vocabulary' : token?.kanjiIds.length ? 'Kanji' : undefined;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close word details">
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => undefined}>
          {token ? <>
            <ThemedText type="japanese">{token.surface}</ThemedText>
            {token.reading ? <ThemedText type="heading">{token.reading}</ThemedText> : null}
            <ThemedText themeColor="textSecondary">
              {dependencyType ? `${dependencyType} details are linked to this authored token.` : 'This token needs an authored vocabulary or kanji link.'}
            </ThemedText>
            {onFavorite && dependencyType ? <AppButton label="Add to favorites" variant="secondary" onPress={() => onFavorite(token)} /> : null}
            {onMarkForReview && dependencyType ? <AppButton label="Mark for review" variant="secondary" onPress={() => onMarkForReview(token)} /> : null}
            <AppButton label="Close" variant="quiet" onPress={onClose} />
          </> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, gap: Spacing.two, padding: Spacing.three },
});
