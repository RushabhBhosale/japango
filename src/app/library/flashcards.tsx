import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  advancePersistedKanjiFlashcardSession,
  endPersistedKanjiFlashcardSession,
  recordKanjiFlashcardRating,
  startPersistedKanjiFlashcardSession,
  type KanjiFlashcardSession,
} from '@/services/database/kanji-flashcard-repository';
import { setFsrsCardState } from '@/services/database/fsrs-repository';
import { toggleContentBookmark } from '@/services/database/content-learning-repository';
import { kanjiFlashcardDirections, type KanjiFlashcardDirection, type KanjiFlashcardSet } from '@/types/kanji-flashcards';

const sets: readonly { id: KanjiFlashcardSet; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'N5', label: 'N5' },
  { id: 'N4', label: 'N4' },
  { id: 'weak', label: 'Weak' },
  { id: 'due', label: 'Due' },
  { id: 'bookmarked', label: 'Bookmarked' },
  { id: 'recently-incorrect', label: 'Recent mistakes' },
];

const directionLabels: Record<KanjiFlashcardDirection, string> = {
  'kanji-to-meaning': 'Kanji → meaning',
  'kanji-to-reading': 'Kanji → reading',
  'meaning-to-kanji': 'Meaning → kanji',
  'reading-to-kanji': 'Reading → kanji',
  'vocabulary-to-reading': 'Vocabulary → reading',
};

function routeSet(value: string | string[] | undefined): KanjiFlashcardSet {
  const candidate = typeof value === 'string' ? value : undefined;
  return sets.some((set) => set.id === candidate) || candidate === 'custom' ? candidate as KanjiFlashcardSet : 'all';
}

function routeItemIds(value: string | string[] | undefined): string[] {
  return typeof value === 'string' ? value.split(',').map((id) => id.trim()).filter(Boolean) : [];
}

export default function KanjiFlashcardsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ set?: string | string[]; itemIds?: string | string[] }>();
  const initialSet = routeSet(params.set);
  const initialItemIds = useMemo(() => routeItemIds(params.itemIds), [params.itemIds]);
  const [set, setSet] = useState<KanjiFlashcardSet>(initialSet);
  const [directions, setDirections] = useState<KanjiFlashcardDirection[]>(['kanji-to-meaning', 'kanji-to-reading']);
  const [session, setSession] = useState<KanjiFlashcardSession>();
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const shownAt = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const nextSession = await startPersistedKanjiFlashcardSession({ set, directions, itemIds: initialItemIds });
      setSession(nextSession);
      setRevealed(false);
      shownAt.current = Date.now();
    } catch {
      setFailed(true);
    }
  }, [directions, initialItemIds, set]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const cards = session?.cards;
  const index = session?.currentIndex ?? 0;
  const card = cards?.[index];
  const toggleDirection = (direction: KanjiFlashcardDirection) => {
    setDirections((current) => current.includes(direction)
      ? current.length === 1 ? current : current.filter((candidate) => candidate !== direction)
      : [...current, direction]);
  };

  const nextCard = async () => {
    if (!session) return;
    setSession(await advancePersistedKanjiFlashcardSession(session));
    setRevealed(false);
    shownAt.current = Date.now();
  };

  const rate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!card) return;
    setSaving(true);
    try {
      await recordKanjiFlashcardRating({ itemId: card.item.id, direction: card.direction, rating, sessionId: session?.id, responseTimeMs: Date.now() - (shownAt.current ?? Date.now()) });
      await nextCard();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const bookmark = async () => {
    if (!card) return;
    setSaving(true);
    try {
      await toggleContentBookmark(card.item.id);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const suspend = async () => {
    if (!card) return;
    setSaving(true);
    try {
      await setFsrsCardState(card.item.id, 'suspend');
      await nextCard();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const endSession = async () => {
    if (session) await endPersistedKanjiFlashcardSession(session.id);
    router.replace('/(tabs)/library' as Href);
  };

  if (!cards && !failed) return <ScreenContainer scroll={false}><LoadingState label="Preparing kanji flashcards…" /></ScreenContainer>;
  if (failed) return <ScreenContainer><EmptyState title="Flashcards are unavailable" message="Your local kanji and review data remain saved. Try reopening this set." symbol="!" /><AppButton label="Back to Study Library" onPress={() => router.replace('/(tabs)/library' as Href)} /></ScreenContainer>;
  if (!cards) return null;
  if (!cards.length) return <ScreenContainer><PageHeader eyebrow="Recall practice" title="Kanji Flashcards" subtitle="Choose a different set or direction to start a local FSRS review." /><EmptyState title="No cards in this set" message="Try all kanji, another JLPT level, or add kanji to your bookmarks." /><AppButton label="Back to Kanji Notebook" onPress={() => router.replace('/library/kanji' as Href)} /></ScreenContainer>;
  if (index >= cards.length) return <ScreenContainer contentStyle={styles.centered}><ThemedText type="smallBold" themeColor="primary">SESSION COMPLETE</ThemedText><ThemedText type="title">Recall practice saved.</ThemedText><Card><ThemedText>{cards.length} canonical kanji cards were rated using the existing FSRS scheduler.</ThemedText><ThemedText themeColor="textSecondary">A kanji is scheduled once per session even when multiple directions are selected.</ThemedText></Card><AppButton label="Choose another set" onPress={() => void load()} /><AppButton label="Back to Study Library" variant="secondary" onPress={() => router.replace('/(tabs)/library' as Href)} /></ScreenContainer>;
  if (!card) return null;

  return (
    <ScreenContainer>
      <PageHeader eyebrow={`Card ${index + 1} of ${cards.length}`} title="Kanji Flashcards" subtitle="Recall first, then reveal and rate honestly." />
      <ProgressBar value={((index + (revealed ? 1 : 0)) / cards.length) * 100} accessibilityLabel="Kanji flashcard progress" />
      <View accessibilityRole="tablist" style={styles.filters}>
        {sets.map((option) => <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: set === option.id }} onPress={() => setSet(option.id)} style={({ pressed }) => [styles.filter, { borderColor: set === option.id ? theme.primary : theme.border, backgroundColor: set === option.id ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">{option.label}</ThemedText></Pressable>)}
      </View>
      <View style={styles.filters}>
        {kanjiFlashcardDirections.map((direction) => <Pressable key={direction} accessibilityRole="checkbox" accessibilityState={{ checked: directions.includes(direction) }} onPress={() => toggleDirection(direction)} style={({ pressed }) => [styles.filter, { borderColor: directions.includes(direction) ? theme.primary : theme.border, backgroundColor: directions.includes(direction) ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">{directionLabels[direction]}</ThemedText></Pressable>)}
      </View>
      <Card accessibilityLabel={`Flashcard prompt: ${card.frontLabel}`}>
        <ThemedText type="smallBold" themeColor="primary">{card.frontLabel}</ThemedText>
        <ThemedText type="title">{card.frontText}</ThemedText>
        {revealed ? <><ThemedText type="smallBold">Answer</ThemedText><ThemedText type="heading">{card.answer}</ThemedText><ThemedText themeColor="textSecondary">{card.answerDetail}</ThemedText><ThemedText type="small" themeColor="textSecondary">Vocabulary: {card.item.exampleVocabulary.join(' · ') || 'No canonical example vocabulary yet'} · Recent accuracy: {card.item.recentAccuracy === undefined ? '—' : `${card.item.recentAccuracy}%`}</ThemedText></> : null}
      </Card>
      {!revealed ? <AppButton label="Reveal answer" onPress={() => setRevealed(true)} /> : <><View style={styles.ratings}><AppButton label="Again" variant="secondary" loading={saving} onPress={() => void rate('again')} /><AppButton label="Hard" variant="secondary" loading={saving} onPress={() => void rate('hard')} /><AppButton label="Good" variant="secondary" loading={saving} onPress={() => void rate('good')} /><AppButton label="Easy" variant="secondary" loading={saving} onPress={() => void rate('easy')} /></View><AppButton label="Bookmark" variant="quiet" loading={saving} onPress={() => void bookmark()} /><AppButton label="Suspend" variant="quiet" loading={saving} onPress={() => void suspend()} /></>}
      <AppButton label="End session" variant="quiet" onPress={() => void endSession()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 12 },
  ratings: { gap: Spacing.two },
  pressed: { opacity: 0.76 },
});
