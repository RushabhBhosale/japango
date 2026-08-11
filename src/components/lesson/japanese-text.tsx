import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { splitJapaneseText } from '@/components/lesson/japanese-text-matcher';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { findJapaneseTextItems, getFuriganaPreference, subscribeToFuriganaPreference, type JapaneseTextItem } from '@/services/database/japanese-text-repository';
import type { FuriganaPreference } from '@/types/learning';

function notebookHref(item: Exclude<JapaneseTextItem, { type: 'supplementary' }>): Href {
  if (item.id.startsWith('n5-')) return `/curriculum/${encodeURIComponent(item.id)}` as Href;
  return `/${item.type}/${encodeURIComponent(item.id)}` as Href;
}

interface JapaneseTextProps extends ThemedTextProps {
  /** Per-screen preview used by explicit furigana toggles; it never changes the saved preference. */
  furiganaOverride?: boolean;
  additionalItems?: JapaneseTextItem[];
  onItemPress?: (item: JapaneseTextItem) => void;
}

/** Shared interactive Japanese renderer for lessons, readings, and notebooks. */
export function JapaneseText({
  children,
  type = 'default',
  style,
  themeColor,
  accessibilityLabel,
  furiganaOverride,
  additionalItems,
  onItemPress,
  ...textProps
}: JapaneseTextProps) {
  const theme = useTheme();
  const text = typeof children === 'string' ? children : '';
  const [preference, setPreference] = useState<FuriganaPreference>('learning');
  const [items, setItems] = useState<JapaneseTextItem[]>([]);
  const [selected, setSelected] = useState<JapaneseTextItem>();

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

  const segments = useMemo(() => splitJapaneseText(text, items), [items, text]);
  if (!text) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{children}</ThemedText>;
  if (!items.length) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{text}</ThemedText>;

  const openItem = (item: JapaneseTextItem) => {
    onItemPress?.(item);
    setSelected(item);
  };
  const showRuby = (furiganaOverride ?? preference === 'always')
    && segments.some((segment) => segment.kind === 'item' && Boolean(segment.reading));
  const textContent = showRuby ? (
    <View accessibilityLabel={accessibilityLabel} style={styles.textLine}>
      {segments.map((segment, index) => {
        if (segment.kind === 'plain') return <ThemedText key={`${index}-${segment.text}`} type={type} style={[styles.plainSegment, style]} themeColor={themeColor} {...textProps}>{segment.text}</ThemedText>;
        return (
          <Pressable
            key={segment.item.id + index}
            accessibilityRole="button"
            accessibilityLabel={`${segment.text}${segment.reading ? `, ${segment.reading}` : ''}. Open word details.`}
            onPress={() => openItem(segment.item)}
            style={styles.item}
          >
            {segment.reading ? <ThemedText type="small" style={[styles.furigana, { color: theme.textSecondary }]}>{segment.reading}</ThemedText> : null}
            <ThemedText type={type} style={[style, styles.written, { color: theme.primary }]} themeColor={themeColor} {...textProps}>{segment.text}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  ) : (
    <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>
      {segments.map((segment, index) => segment.kind === 'plain'
        ? <Text key={`${index}-${segment.text}`}>{segment.text}</Text>
        : <Text key={segment.item.id + index} accessibilityRole="button" accessibilityLabel={`${segment.text}. Tap to reveal its reading and meaning.`} onPress={() => openItem(segment.item)} suppressHighlighting style={[styles.inlineItem, { color: theme.primary }]}>{segment.text}</Text>)}
    </ThemedText>
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
  item: { alignItems: 'center', flexShrink: 1, justifyContent: 'flex-end', maxWidth: '100%', minHeight: 28, minWidth: 0, paddingHorizontal: 1 },
  inlineItem: { fontWeight: '700', textDecorationLine: 'underline' },
  written: { fontWeight: '700', maxWidth: '100%', minWidth: 0, textAlign: 'center', textDecorationLine: 'underline' },
  furigana: { fontSize: 11, fontWeight: '500', lineHeight: 13, textDecorationLine: 'none' },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, gap: Spacing.twoHalf, maxWidth: 720, padding: Spacing.four, width: '100%' },
});
