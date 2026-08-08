/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#27212E',
    background: '#F8F4EC',
    surface: '#FFFCF7',
    surfaceElevated: '#FFFFFF',
    backgroundElement: '#ECE6F0',
    backgroundSelected: '#E3DAEE',
    textSecondary: '#6D6475',
    primary: '#5A478C',
    primaryPressed: '#46356F',
    primarySoft: '#ECE6F6',
    border: '#DDD5E2',
    success: '#26745E',
    successSoft: '#DDF0E8',
    error: '#B44C58',
    errorSoft: '#F8E3E6',
    warning: '#9B6227',
    warningSoft: '#F6E8D5',
    onPrimary: '#FFFFFF',
  },
  dark: {
    text: '#F7F2FA',
    background: '#15121A',
    surface: '#211B29',
    surfaceElevated: '#2A2233',
    backgroundElement: '#30273A',
    backgroundSelected: '#3A2F4D',
    textSecondary: '#BEB4C6',
    primary: '#C5B2F3',
    primaryPressed: '#D5C6F7',
    primarySoft: '#332A49',
    border: '#44384F',
    success: '#7FD0B5',
    successSoft: '#203B34',
    error: '#F0A1AA',
    errorSoft: '#49282F',
    warning: '#EDBE7D',
    warningSoft: '#46351F',
    onPrimary: '#251B35',
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
