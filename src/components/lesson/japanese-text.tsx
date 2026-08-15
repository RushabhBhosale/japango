import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { FuriganaBubble } from '@/components/lesson/furigana-bubble';
import { splitJapaneseText, type JapaneseTextSegment } from '@/components/lesson/japanese-text-matcher';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { alignContextualReading, type ContextualReadingSegment } from '@/features/japanese-text/contextual-reading';
import { useTheme } from '@/hooks/use-theme';
import { findJapaneseTextItems, getFuriganaPreference, subscribeToFuriganaPreference, type JapaneseTextItem } from '@/services/database/japanese-text-repository';
import type { FuriganaPreference } from '@/types/learning';

const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;

function notebookHref(item: Exclude<JapaneseTextItem, { type: 'supplementary' }>): Href {
  if (item.id.startsWith('n5-')) return `/curriculum/${encodeURIComponent(item.id)}` as Href;
  return `/${item.type}/${encodeURIComponent(item.id)}` as Href;
}

interface JapaneseTextProps extends ThemedTextProps {
  /** Per-screen preview used by explicit furigana toggles; it never changes the saved preference. */
  furiganaOverride?: boolean;
  /** Keeps readings in text flow instead of floating above the surrounding UI. */
  furiganaDisplay?: 'bubble' | 'inline';
  /** Reviewed pronunciation for this exact string, used before dictionary matching. */
  contextualReading?: string;
  additionalItems?: JapaneseTextItem[];
  /** Turns off word-detail controls while retaining contextual furigana. */
  interactive?: boolean;
  onItemPress?: (item: JapaneseTextItem) => void;
}

function contextualItem(
  fullText: string,
  segment: ContextualReadingSegment & { reading: string },
  items: JapaneseTextItem[],
): JapaneseTextItem {
  const exact = items.find((item) => item.title === segment.text);
  if (exact) return { ...exact, reading: segment.reading };
  const containingWord = items.find((item) => (
    item.title.startsWith(segment.text)
    && fullText.startsWith(item.title, segment.start)
  ));
  return {
    id: `contextual-reading-${segment.start}-${Array.from(segment.text).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`,
    type: 'supplementary',
    title: segment.text,
    reading: segment.reading,
    meaning: containingWord?.meaning,
  };
}

/** Shared interactive Japanese renderer for lessons, readings, and notebooks. */
export function JapaneseText({
  children,
  type = 'default',
  style,
  themeColor,
  accessibilityLabel,
  furiganaOverride,
  furiganaDisplay = 'inline',
  contextualReading,
  additionalItems,
  interactive = true,
  onItemPress,
  ...textProps
}: JapaneseTextProps) {
  const theme = useTheme();
  const text = typeof children === 'string' ? children : '';
  const [preference, setPreference] = useState<FuriganaPreference>('learning');
  const [items, setItems] = useState<JapaneseTextItem[]>([]);
  const [selected, setSelected] = useState<JapaneseTextItem>();
  const [openedSegmentKey, setOpenedSegmentKey] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([getFuriganaPreference(), findJapaneseTextItems(text)])
      .then(([nextPreference, nextItems]) => {
        if (!active) return;
        setPreference(nextPreference);
        const byId = new Map([...nextItems, ...(additionalItems ?? [])].map((item) => [item.id, item]));
        setItems([...byId.values()].sort((left, right) => right.title.length - left.title.length));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [additionalItems, text]);

  useEffect(() => subscribeToFuriganaPreference(setPreference), []);

  const dictionarySegments = useMemo(() => splitJapaneseText(text, items), [items, text]);
  const contextualSegments = useMemo<JapaneseTextSegment[] | undefined>(() => {
    if (!contextualReading) return undefined;
    const aligned = alignContextualReading(text, contextualReading);
    return aligned?.map((segment) => segment.reading && kanjiPattern.test(segment.text)
      ? {
          kind: 'item' as const,
          item: contextualItem(text, { ...segment, reading: segment.reading }, items),
          text: segment.text,
          reading: segment.reading,
        }
      : { kind: 'plain' as const, text: segment.text });
  }, [contextualReading, items, text]);
  const segments = contextualSegments ?? dictionarySegments;
  if (!text) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{children}</ThemedText>;
  if (!items.length && !contextualSegments) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{text}</ThemedText>;

  const alwaysShowFurigana = furiganaOverride ?? preference === 'always';
  const openItem = (item: JapaneseTextItem, segmentKey: string, reading?: string) => {
    onItemPress?.(item);
    const hasKanji = kanjiPattern.test(item.title);
    if (reading && hasKanji && !alwaysShowFurigana && openedSegmentKey !== segmentKey) {
      setOpenedSegmentKey(segmentKey);
      return;
    }
    setOpenedSegmentKey(undefined);
    setSelected(item);
  };
  const textContent = (
    <View accessibilityLabel={accessibilityLabel} style={styles.textLine}>
      {segments.map((segment, index) => {
        if (segment.kind === 'plain') return <ThemedText key={`${index}-${segment.text}`} type={type} style={[styles.plainSegment, style]} themeColor={themeColor} {...textProps}>{segment.text}</ThemedText>;
        const segmentKey = `${segment.item.id}-${index}`;
        const hasKanji = kanjiPattern.test(segment.text);
        const canRevealReading = Boolean(segment.reading && hasKanji);
        const bubbleVisible = canRevealReading && (alwaysShowFurigana || openedSegmentKey === segmentKey);
        const showInlineFurigana = bubbleVisible && furiganaDisplay === 'inline';
        const accessibilityAction = canRevealReading
          ? bubbleVisible ? 'Open word details.' : 'Show its reading.'
          : 'Open word details.';
        const written = <ThemedText type={type} style={[style, interactive && styles.written, interactive && { color: theme.primary }]} themeColor={themeColor} {...textProps}>{segment.text}</ThemedText>;
        if (!interactive) {
          return (
            <View key={segmentKey} style={[styles.item, showInlineFurigana && styles.itemWithInlineFurigana, bubbleVisible && !showInlineFurigana && styles.itemWithBubble]}>
              {showInlineFurigana && segment.reading ? <ThemedText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[styles.inlineReading, { color: theme.textSecondary }]}>{segment.reading}</ThemedText> : null}
              {bubbleVisible && !showInlineFurigana && segment.reading ? <FuriganaBubble reading={segment.reading} /> : null}
              {written}
            </View>
          );
        }
        return (
          <Pressable
            key={segmentKey}
            accessibilityRole="button"
            accessibilityLabel={`${segment.text}${bubbleVisible && segment.reading ? `, ${segment.reading}` : ''}. ${accessibilityAction}`}
            onPress={() => openItem(segment.item, segmentKey, segment.reading)}
            style={({ pressed }) => [styles.item, showInlineFurigana && styles.itemWithInlineFurigana, bubbleVisible && !showInlineFurigana && styles.itemWithBubble, pressed && styles.itemPressed]}
          >
            {showInlineFurigana && segment.reading ? <ThemedText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={[styles.inlineReading, { color: theme.textSecondary }]}>{segment.reading}</ThemedText> : null}
            {bubbleVisible && !showInlineFurigana && segment.reading ? <FuriganaBubble reading={segment.reading} /> : null}
            {written}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      {textContent}
      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(undefined)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(undefined)} accessibilityLabel="Close word details">
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => undefined}>
            {selected ? <>
              <ThemedText type="japanese">{selected.title}</ThemedText>
              {selected.reading ? <ThemedText type="heading">{selected.reading}</ThemedText> : null}
              <ThemedText themeColor="textSecondary">{selected.meaning ?? (selected.type === 'supplementary' ? 'This reading is supplied for the lesson example.' : 'Meaning is available in the notebook.')}</ThemedText>
              {selected.type !== 'supplementary' ? <AppButton label={`View ${selected.type === 'kanji' ? 'Kanji' : 'Vocabulary'} Details`} variant="secondary" onPress={() => { const target = selected; setSelected(undefined); router.push(notebookHref(target)); }} /> : null}
              <AppButton label="Close" variant="quiet" onPress={() => setSelected(undefined)} />
            </> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Descriptive alias used by reading experiences; the implementation remains
// the single shared renderer used throughout the app.
export const InteractiveJapaneseText = JapaneseText;

const styles = StyleSheet.create({
  textLine: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', maxWidth: '100%', minWidth: 0, rowGap: Spacing.two, width: '100%' },
  plainSegment: { flexShrink: 1, maxWidth: '100%', minWidth: 0 },
  item: { alignItems: 'center', flexShrink: 1, justifyContent: 'flex-end', maxWidth: '100%', minHeight: 28, minWidth: 0, paddingHorizontal: 1, position: 'relative' },
  itemWithInlineFurigana: { flexShrink: 0, minHeight: 40, paddingTop: 2 },
  itemPressed: { opacity: 0.7 },
  itemWithBubble: { zIndex: 10 },
  inlineReading: { flexShrink: 0, fontSize: 10, fontWeight: '700', lineHeight: 12, marginBottom: -1, textAlign: 'center' },
  written: { fontWeight: '700', maxWidth: '100%', minWidth: 0, textAlign: 'center', textDecorationLine: 'underline' },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, gap: Spacing.twoHalf, maxWidth: 720, padding: Spacing.four, width: '100%' },
});
