/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1D2925',
    background: '#F7F6F2',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    backgroundElement: '#E9EEEB',
    backgroundSelected: '#DCEBE5',
    textSecondary: '#68736E',
    primary: '#26735F',
    primaryPressed: '#1D5D4D',
    primarySoft: '#DFEEE8',
    border: '#DCE3DF',
    success: '#287A55',
    successSoft: '#DDF1E5',
    error: '#B14A48',
    errorSoft: '#F8E3E1',
    warning: '#9A641F',
    warningSoft: '#F8ECD7',
    onPrimary: '#FFFFFF',
  },
  dark: {
    text: '#EDF3F0',
    background: '#101714',
    surface: '#18221E',
    surfaceElevated: '#1D2924',
    backgroundElement: '#24322C',
    backgroundSelected: '#294A3F',
    textSecondary: '#AAB7B1',
    primary: '#71C4A7',
    primaryPressed: '#8BD5BB',
    primarySoft: '#203C33',
    border: '#31443C',
    success: '#7DCCA4',
    successSoft: '#1E3C2D',
    error: '#F0A4A0',
    errorSoft: '#462A29',
    warning: '#E7BD7B',
    warningSoft: '#42351F',
    onPrimary: '#10231D',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 680;
