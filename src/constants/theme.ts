/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#24252A',
    background: '#F4F5F2',
    surface: '#FCFDFB',
    surfaceElevated: '#FFFFFF',
    backgroundElement: '#ECEEEA',
    backgroundSelected: '#E2E5E0',
    textSecondary: '#686A70',
    primary: '#505777',
    primaryPressed: '#3F4665',
    primarySoft: '#E7E9F0',
    border: '#D9DCD6',
    success: '#426C5A',
    successSoft: '#E0ECE5',
    error: '#B4555A',
    errorSoft: '#F4E4E5',
    warning: '#8A652C',
    warningSoft: '#F1E8D8',
    onPrimary: '#FFFFFF',
  },
  dark: {
    text: '#F2F2EF',
    background: '#161719',
    surface: '#202124',
    surfaceElevated: '#27282B',
    backgroundElement: '#2B2D2E',
    backgroundSelected: '#34363A',
    textSecondary: '#B7B8B4',
    primary: '#B8BDE0',
    primaryPressed: '#CDD1EA',
    primarySoft: '#303344',
    border: '#3B3D3F',
    success: '#82B39C',
    successSoft: '#223A30',
    error: '#E6A0A4',
    errorSoft: '#45292D',
    warning: '#D4B275',
    warningSoft: '#40341F',
    onPrimary: '#202231',
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
    japaneseSans: 'Hiragino Sans',
    editorial: 'Hiragino Mincho ProN',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    japaneseSans: 'sans-serif',
    editorial: 'serif',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    japaneseSans: 'var(--font-japanese-sans)',
    editorial: 'var(--font-editorial)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  twoHalf: 12,
  three: 16,
  threeHalf: 20,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 760;
export const ReadingContentWidth = 700;
