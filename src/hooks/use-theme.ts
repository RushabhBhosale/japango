/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/store/app-store';

export function useTheme() {
  const systemScheme = useColorScheme();
  const preference = useAppStore((state) => state.settings.themePreference);
  const resolvedSystemScheme = systemScheme === 'dark' ? 'dark' : 'light';
  const theme = preference === 'system' ? resolvedSystemScheme : preference;

  return Colors[theme];
}

export function useResolvedColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const preference = useAppStore((state) => state.settings.themePreference);
  if (preference !== 'system') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
