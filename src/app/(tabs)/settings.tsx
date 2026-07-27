import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/card';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { ThemePreference } from '@/types/learning';

const studyGoals = [5, 10, 15, 20, 30];
const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const settings = useAppStore((state) => state.settings);
  const updateDailyGoal = useAppStore((state) => state.updateDailyGoal);
  const updateThemePreference = useAppStore((state) => state.updateThemePreference);
  const [message, setMessage] = useState<string>();

  const changeGoal = async (minutes: number) => {
    setMessage(undefined);
    try {
      await updateDailyGoal(minutes);
      setMessage('Daily goal updated.');
    } catch {
      setMessage('The daily goal could not be updated.');
    }
  };

  const changeTheme = async (preference: ThemePreference) => {
    setMessage(undefined);
    try {
      await updateThemePreference(preference);
    } catch {
      setMessage('The appearance setting could not be updated.');
    }
  };

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Make it yours" title="Settings" subtitle="Keep daily practice comfortable and realistic." />

      <SectionHeading title="Learner profile" />
      <Card>
        <ThemedText type="heading">{profile?.displayName ?? 'Local learner'}</ThemedText>
        <ThemedText themeColor="textSecondary">{profile?.learnerLevel ?? 'Assessment pending'}</ThemedText>
      </Card>

      <SectionHeading title="Daily study goal" detail={`${profile?.dailyGoalMinutes ?? 10} minutes`} />
      <Card>
        <View style={styles.options} accessibilityRole="radiogroup">
          {studyGoals.map((minutes) => {
            const selected = profile?.dailyGoalMinutes === minutes;
            return (
              <Pressable
                key={minutes}
                accessibilityRole="radio"
                accessibilityLabel={`${minutes} minutes per day`}
                accessibilityState={{ checked: selected }}
                onPress={() => void changeGoal(minutes)}
                style={[
                  styles.option,
                  { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface },
                ]}>
                <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{minutes} min</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeading title="Appearance" />
      <Card>
        <View style={styles.options} accessibilityRole="radiogroup">
          {themeOptions.map((option) => {
            const selected = settings.themePreference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void changeTheme(option.value)}
                style={[
                  styles.option,
                  styles.themeOption,
                  { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface },
                ]}>
                <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {message ? <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">{message}</ThemedText> : null}

      <SectionHeading title="Data & privacy" />
      <Card>
        <ThemedText type="smallBold">Stored on this device</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your profile, curriculum progress, assessment answers, review schedule, and settings are kept in JapanGo’s local database.
        </ThemedText>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ThemedText type="smallBold">No account or AI connection</ThemedText>
        <ThemedText themeColor="textSecondary">
          Phase 1 does not send your learning data to a backend, analytics service, or AI provider.
        </ThemedText>
      </Card>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>JapanGo · Phase 1 local foundation</ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: { minHeight: 46, minWidth: 72, borderRadius: Radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  themeOption: { flex: 1 },
  divider: { height: 1, marginVertical: Spacing.one },
  version: { textAlign: 'center', marginTop: Spacing.two },
});
