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

function showsFurigana(item: JapaneseTextItem, preference: FuriganaPreference): boolean {
  return preference === 'always' && Boolean(item.reading);
}

function notebookHref(item: JapaneseTextItem): Href {
  if (item.id.startsWith('n5-')) return `/curriculum/${encodeURIComponent(item.id)}` as Href;
  return `/${item.type}/${encodeURIComponent(item.id)}` as Href;
}

/** Shared Japanese renderer for lessons and notebooks. Furigana follows the learner's saved progress setting. */
export function JapaneseText({ children, type = 'default', style, themeColor, accessibilityLabel, ...textProps }: ThemedTextProps) {
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
        setItems(nextItems);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [text]);

  useEffect(() => subscribeToFuriganaPreference(setPreference), []);

  const segments = useMemo(() => splitJapaneseText(text, items), [items, text]);
  if (!text) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{children}</ThemedText>;
  if (!items.length) return <ThemedText type={type} style={style} themeColor={themeColor} accessibilityLabel={accessibilityLabel} {...textProps}>{text}</ThemedText>;

  const showRuby = preference === 'always' && segments.some((segment) => segment.kind === 'item' && showsFurigana(segment.item, preference));
  const textContent = showRuby ? (
    <View accessibilityLabel={accessibilityLabel} style={styles.textLine}>
      {segments.map((segment, index) => {
        if (segment.kind === 'plain') return <ThemedText key={`${index}-${segment.text}`} type={type} style={style} themeColor={themeColor} {...textProps}>{segment.text}</ThemedText>;
        return (
          <Pressable
            key={segment.item.id + index}
            accessibilityRole="button"
            accessibilityLabel={`${segment.text}${segment.reading ? `, ${segment.reading}` : ''}. Open word details.`}
            onPress={() => setSelected(segment.item)}
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
        : <Text key={segment.item.id + index} accessibilityRole="button" accessibilityLabel={`${segment.text}. Tap to reveal its reading and meaning.`} onPress={() => setSelected(segment.item)} suppressHighlighting style={[styles.inlineItem, { color: theme.primary }]}>{segment.text}</Text>)}
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
              <ThemedText themeColor="textSecondary">{selected.meaning ?? 'Meaning is available in the notebook.'}</ThemedText>
              <AppButton label={`View ${selected.type === 'kanji' ? 'Kanji' : 'Vocabulary'} Details`} variant="secondary" onPress={() => { const target = selected; setSelected(undefined); router.push(notebookHref(target)); }} />
              <AppButton label="Close" variant="quiet" onPress={() => setSelected(undefined)} />
            </> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  textLine: { alignItems: 'flex-end', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', maxWidth: '100%' },
  item: { alignItems: 'center', flexShrink: 1, justifyContent: 'flex-end', minHeight: 28, paddingHorizontal: 1 },
  inlineItem: { fontWeight: '700', textDecorationLine: 'underline' },
  written: { fontWeight: '700', textDecorationLine: 'underline' },
  furigana: { fontSize: 11, fontWeight: '500', lineHeight: 13, textDecorationLine: 'none' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large, gap: Spacing.two, padding: Spacing.three },
});
