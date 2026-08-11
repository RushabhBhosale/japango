import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'heading'
    | 'section'
    | 'cardTitle'
    | 'japanese'
    | 'japaneseReading'
    | 'metadata'
    | 'button'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        styles.base,
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'display' && styles.display,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'heading' && styles.heading,
        type === 'section' && styles.section,
        type === 'cardTitle' && styles.cardTitle,
        type === 'japanese' && styles.japanese,
        type === 'japaneseReading' && styles.japaneseReading,
        type === 'metadata' && styles.metadata,
        type === 'button' && styles.button,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.primary }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
    fontFamily: Fonts.sans,
    maxWidth: '100%',
    minWidth: 0,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  title: {
    fontFamily: Fonts.editorial,
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 40,
  },
  display: {
    fontFamily: Fonts.editorial,
    fontSize: 38,
    fontWeight: 700,
    letterSpacing: -0.6,
    lineHeight: 48,
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: 700,
  },
  heading: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: 700,
  },
  section: {
    fontFamily: Fonts.editorial,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 30,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 25,
  },
  japanese: {
    fontFamily: Fonts.japaneseSans,
    fontSize: 25,
    lineHeight: 39,
    fontWeight: 500,
  },
  japaneseReading: {
    fontFamily: Fonts.editorial,
    fontSize: 28,
    fontWeight: 500,
    letterSpacing: 0.25,
    lineHeight: 47,
  },
  metadata: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  button: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 21,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
