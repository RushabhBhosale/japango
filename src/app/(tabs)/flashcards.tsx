import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  getVocabularyFlashcardProgress,
  getVocabularyFlashcards,
  saveVocabularyFlashcardProgress,
} from '@/services/database/vocabulary-flashcard-repository';
import { useTheme } from '@/hooks/use-theme';
import type {
  VocabularyFlashcard,
  VocabularyFlashcardLevel,
  VocabularyFlashcardProgressFilter,
} from '@/types/vocabulary-flashcards';

const SWIPE_DISTANCE = 72;
const CARD_TRAVEL_DISTANCE = 460;

const levelOptions: { value: VocabularyFlashcardLevel; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'N5', label: 'N5' },
  { value: 'N4', label: 'N4' },
];

const progressOptions: { value: VocabularyFlashcardProgressFilter; label: string }[] = [
  { value: 'all', label: 'All words' },
  { value: 'unlearned', label: 'Unlearned' },
  { value: 'learned', label: 'Learned' },
];

function filterKey(level: VocabularyFlashcardLevel, progress: VocabularyFlashcardProgressFilter): string {
  return `${level}:${progress}`;
}

function restoreOrder(cards: VocabularyFlashcard[], orderedIds: string[]): VocabularyFlashcard[] {
  if (!orderedIds.length) return cards;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const restored = orderedIds.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
  const present = new Set(restored.map((card) => card.id));
  return [...restored, ...cards.filter((card) => !present.has(card.id))];
}

function hasKanji(value: string): boolean {
  return /[\u3400-\u9fff々ヶ]/u.test(value);
}

function FilterPill<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onSelect(option.value)}
            style={[styles.pill, { backgroundColor: active ? theme.primarySoft : theme.surface, borderColor: active ? theme.primary : theme.border }]}
          >
            <ThemedText type="smallBold" style={active ? { color: theme.primary } : undefined}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FlashcardFace({ card, back, theme }: { card: VocabularyFlashcard; back: boolean; theme: ReturnType<typeof useTheme> }) {
  const showReading = back && hasKanji(card.japanese) && Boolean(card.reading) && card.reading !== card.japanese;
  return (
    <View style={[styles.face, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
      <ThemedText type="title" style={styles.cardWord}>{card.japanese}</ThemedText>
      {back ? (
        <>
          {showReading ? <ThemedText type="heading" style={{ color: theme.primary }}>{card.reading}</ThemedText> : null}
          <ThemedText type="heading" themeColor="textSecondary" style={styles.cardMeaning}>{card.meaning ?? 'Meaning not available yet'}</ThemedText>
        </>
      ) : null}
    </View>
  );
}

export default function FlashcardsScreen() {
  const theme = useTheme();
  const [level, setLevel] = useState<VocabularyFlashcardLevel>('all');
  const [progressFilter, setProgressFilter] = useState<VocabularyFlashcardProgressFilter>('all');
  const [cards, setCards] = useState<VocabularyFlashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [transition, setTransition] = useState<{ direction: -1 | 1; nextIndex: number }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadNonce, setReloadNonce] = useState(0);
  const cardX = useMemo(() => new Animated.Value(0), []);
  const incomingCardX = useMemo(() => new Animated.Value(0), []);
  const flip = useMemo(() => new Animated.Value(0), []);
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const horizontalSwipe = useRef(false);
  const queryKey = useMemo(() => filterKey(level, progressFilter), [level, progressFilter]);

  const resetCardAnimation = useCallback(() => {
    cardX.stopAnimation();
    incomingCardX.stopAnimation();
    flip.stopAnimation();
    cardX.setValue(0);
    incomingCardX.setValue(0);
    flip.setValue(0);
  }, [cardX, flip, incomingCardX]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getVocabularyFlashcards({ level, progress: progressFilter }),
      getVocabularyFlashcardProgress(),
    ]).then(([loadedCards, savedProgress]) => {
      if (!active) return;
      const savedForQuery = savedProgress?.filterKey === queryKey ? savedProgress : undefined;
      const ordered = restoreOrder(loadedCards, savedForQuery?.orderedIds ?? []);
      const nextIndex = Math.min(savedForQuery?.index ?? 0, Math.max(ordered.length - 1, 0));
      resetCardAnimation();
      setFlipped(false);
      setError(undefined);
      setCards(ordered);
      setIndex(nextIndex);
      setLoadedQueryKey(queryKey);
    }).catch(() => {
      if (active) setError('Your vocabulary cards could not be loaded. Your saved lessons are still available.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [level, progressFilter, queryKey, reloadNonce, resetCardAnimation]);

  useFocusEffect(useCallback(() => () => {
    void saveVocabularyFlashcardProgress({ filterKey: queryKey, index, orderedIds: cards.map((card) => card.id) });
  }, [cards, index, queryKey]));

  const commitIndex = useCallback((nextIndex: number, orderedCards = cards) => {
    setIndex(nextIndex);
    setTransition(undefined);
    resetCardAnimation();
    setFlipped(false);
    void saveVocabularyFlashcardProgress({ filterKey: queryKey, index: nextIndex, orderedIds: orderedCards.map((card) => card.id) });
  }, [cards, queryKey, resetCardAnimation]);

  const navigate = useCallback((direction: -1 | 1) => {
    if (transition) return;
    const nextIndex = index + direction;
    // Preserve the current face while it leaves. Resetting the flip here made
    // a flipped card snap back to its front before the swipe could finish.
    flip.stopAnimation();
    if (nextIndex < 0 || nextIndex >= cards.length) {
      Animated.spring(cardX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
      return;
    }
    setTransition({ direction, nextIndex });
    incomingCardX.setValue(direction === 1 ? CARD_TRAVEL_DISTANCE : -CARD_TRAVEL_DISTANCE);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(cardX, { toValue: direction === 1 ? -CARD_TRAVEL_DISTANCE : CARD_TRAVEL_DISTANCE, duration: 220, useNativeDriver: true }),
        Animated.timing(incomingCardX, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) commitIndex(nextIndex);
        else {
          setTransition(undefined);
          resetCardAnimation();
        }
      });
    });
  }, [cardX, cards.length, commitIndex, flip, incomingCardX, index, resetCardAnimation, transition]);

  const toggleFlip = () => {
    const nextFlipped = !flipped;
    flip.stopAnimation();
    setFlipped(nextFlipped);
    Animated.timing(flip, { toValue: nextFlipped ? 180 : 0, duration: 360, useNativeDriver: true }).start();
  };

  const beginTouch = (x: number, y: number) => {
    touchStart.current = { x, y };
    horizontalSwipe.current = false;
  };

  const moveCard = (x: number, y: number) => {
    const start = touchStart.current;
    if (!start) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    horizontalSwipe.current = true;
    cardX.setValue(deltaX);
  };

  const releaseCard = (x: number, y: number) => {
    const start = touchStart.current;
    touchStart.current = undefined;
    if (!start) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (horizontalSwipe.current) {
      if (deltaX <= -SWIPE_DISTANCE) navigate(1);
      else if (deltaX >= SWIPE_DISTANCE) navigate(-1);
      else Animated.spring(cardX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
      return;
    }
    if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) toggleFlip();
    else Animated.spring(cardX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  };

  const shuffle = () => {
    const shuffled = [...cards];
    for (let current = shuffled.length - 1; current > 0; current -= 1) {
      const target = Math.floor(Math.random() * (current + 1));
      [shuffled[current], shuffled[target]] = [shuffled[target], shuffled[current]];
    }
    setCards(shuffled);
    commitIndex(0, shuffled);
  };

  const card = cards[index];
  const incomingCard = transition ? cards[transition.nextIndex] : undefined;
  const frontRotation = flip.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
  const backRotation = flip.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

  if (error) return <ScreenContainer><ThemedText>{error}</ThemedText><AppButton label="Try again" onPress={() => setReloadNonce((current) => current + 1)} /></ScreenContainer>;
  if (loading || loadedQueryKey !== queryKey) return <ScreenContainer scroll={false}><LoadingState label="Preparing your vocabulary cards…" /></ScreenContainer>;

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>VOCABULARY</ThemedText>
          <ThemedText type="title">Flashcards</ThemedText>
          <ThemedText themeColor="textSecondary">Tap to flip. Swipe left or right to move.</ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open flashcard settings" onPress={() => setSettingsVisible(true)} style={[styles.settingsButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Ionicons name="settings-outline" size={21} color={theme.primary} />
        </Pressable>
      </View>

      {!cards.length ? (
        <Card style={styles.emptyCard}>
          <ThemedText type="heading">No cards match these filters.</ThemedText>
          <ThemedText themeColor="textSecondary">Try All levels or All words to see more vocabulary.</ThemedText>
        </Card>
      ) : (
        <>
          <View style={styles.progressRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">{index + 1} / {cards.length}</ThemedText>
          </View>
          <View style={styles.cardDeck}>
          <Animated.View
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={flipped ? `Meaning for ${card.japanese}` : `Flip ${card.japanese} card`}
            onStartShouldSetResponder={() => !transition}
            onResponderGrant={(event) => beginTouch(event.nativeEvent.pageX, event.nativeEvent.pageY)}
            onResponderMove={(event) => moveCard(event.nativeEvent.pageX, event.nativeEvent.pageY)}
            onResponderRelease={(event) => releaseCard(event.nativeEvent.pageX, event.nativeEvent.pageY)}
            onResponderTerminate={() => Animated.spring(cardX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start()}
            style={[styles.cardFrame, styles.activeCard, { transform: [{ translateX: cardX }] }]}
          >
            <Animated.View style={[styles.cardFace, { transform: [{ rotateY: frontRotation }] }]}> 
              <FlashcardFace card={card} back={false} theme={theme} />
            </Animated.View>
            <Animated.View style={[styles.cardFace, styles.backFace, { transform: [{ rotateY: backRotation }] }]}> 
              <FlashcardFace card={card} back theme={theme} />
            </Animated.View>
          </Animated.View>
          {incomingCard ? (
            <Animated.View pointerEvents="none" style={[styles.cardFrame, styles.incomingCard, { transform: [{ translateX: incomingCardX }] }]}> 
              <FlashcardFace card={incomingCard} back={false} theme={theme} />
            </Animated.View>
          ) : null}
          </View>
        </>
      )}

      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close flashcard settings" onPress={() => setSettingsVisible(false)} style={styles.settingsBackdrop}>
          <Pressable onPress={() => undefined} style={[styles.settingsSheet, { backgroundColor: theme.background }]}> 
            <View style={styles.settingsHeader}>
              <ThemedText type="heading">Flashcard settings</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close flashcard settings" onPress={() => setSettingsVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ThemedText type="smallBold" themeColor="textSecondary">LEVEL</ThemedText>
            <FilterPill options={levelOptions} selected={level} onSelect={setLevel} />
            <ThemedText type="smallBold" themeColor="textSecondary">PROGRESS</ThemedText>
            <FilterPill options={progressOptions} selected={progressFilter} onSelect={setProgressFilter} />
            <AppButton label="Shuffle cards" variant="secondary" onPress={shuffle} disabled={!cards.length} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  headerCopy: { flex: 1, gap: Spacing.one },
  settingsButton: { width: 46, height: 46, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  pills: { gap: Spacing.one, paddingVertical: Spacing.one },
  pill: { minHeight: 40, borderWidth: 1, borderRadius: Radius.pill, justifyContent: 'center', paddingHorizontal: Spacing.three },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDeck: { height: 330, position: 'relative', width: '100%' },
  cardFrame: { ...StyleSheet.absoluteFill },
  activeCard: { zIndex: 2 },
  incomingCard: { zIndex: 1 },
  cardFace: { ...StyleSheet.absoluteFill, backfaceVisibility: 'hidden' },
  backFace: { backfaceVisibility: 'hidden' },
  face: { flex: 1, borderWidth: 1, borderRadius: Radius.large, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  cardWord: { textAlign: 'center' },
  cardMeaning: { maxWidth: '90%', textAlign: 'center' },
  emptyCard: { padding: Spacing.four },
  settingsBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  settingsSheet: { gap: Spacing.two, borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, padding: Spacing.four, paddingBottom: Spacing.five },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
