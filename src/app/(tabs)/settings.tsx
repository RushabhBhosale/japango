import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defaultFsrsQueueLimits, getFsrsQueueLimits, restoreAllSuspendedFsrsCards, setFsrsQueueLimits } from '@/services/database/fsrs-repository';
import { clearAiHistoryAndCache } from '@/services/database/ai-repository';
import { getFuriganaPreference, setFuriganaPreference } from '@/services/database/japanese-text-repository';
import { useAppStore } from '@/store/app-store';
import type { FuriganaPreference, ThemePreference } from '@/types/learning';

const studyGoals = [5, 10, 15, 20, 30];
const newCardLimits = [0, 5, 10, 15, 20];
const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const furiganaOptions: { value: FuriganaPreference; label: string; detail: string }[] = [
  { value: 'always', label: 'Always', detail: 'Show readings with Japanese text.' },
  { value: 'learning', label: 'Tap to reveal', detail: 'Hide readings until you tap a word.' },
  { value: 'off', label: 'Hide readings', detail: 'Keep text clean; you can still tap a word for help.' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const settings = useAppStore((state) => state.settings);
  const v3Learner = useAppStore((state) => state.v3Learner);
  const resetV3State = useAppStore((state) => state.resetV3State);
  const updateDailyGoal = useAppStore((state) => state.updateDailyGoal);
  const updateThemePreference = useAppStore((state) => state.updateThemePreference);
  const [message, setMessage] = useState<string>();
  const [newCardsPerDay, setNewCardsPerDay] = useState(defaultFsrsQueueLimits.newCardsPerDay);
  const [furiganaPreference, setFuriganaPreferenceState] = useState<FuriganaPreference>('off');

  useEffect(() => {
    void getFsrsQueueLimits().then((limits) => setNewCardsPerDay(limits.newCardsPerDay)).catch(() => undefined);
    void getFuriganaPreference().then(setFuriganaPreferenceState).catch(() => undefined);
  }, []);

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

  const changeNewCards = async (limit: number) => {
    setMessage(undefined);
    try {
      const limits = await getFsrsQueueLimits();
      await setFsrsQueueLimits({ ...limits, newCardsPerDay: limit });
      setNewCardsPerDay(limit);
      setMessage('Daily new-card limit updated.');
    } catch {
      setMessage('The review limit could not be updated.');
    }
  };

  const changeFurigana = async (preference: FuriganaPreference) => {
    setMessage(undefined);
    try {
      await setFuriganaPreference(preference);
      setFuriganaPreferenceState(preference);
    } catch {
      setMessage('The furigana setting could not be updated.');
    }
  };

  const restoreSuspendedCards = async () => {
    try {
      const restored = await restoreAllSuspendedFsrsCards();
      setMessage(restored ? `${restored} suspended ${restored === 1 ? 'card was' : 'cards were'} restored.` : 'There are no suspended cards.');
    } catch {
      setMessage('Suspended cards could not be restored.');
    }
  };

  const clearAiData = async () => {
    try { await clearAiHistoryAndCache(); setMessage('AI history, cache, and saved retry drafts were cleared.'); } catch { setMessage('AI data could not be cleared.'); }
  };

  const confirmV3Reset = () => {
    Alert.alert(
      'Reset the V3 story?',
      'This clears only V3 onboarding, the starting check, Episode 1 progress, and V3 learned items. Legacy lessons, OCR data, and reference content stay untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset V3', style: 'destructive', onPress: () => {
            void resetV3State().then(() => router.replace('/')).catch(() => setMessage('V3 state could not be reset.'));
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Make it yours" title="Settings" subtitle="Keep daily practice comfortable and realistic." />

      <SectionHeading title="V3 story testing" />
      <Card>
        <ThemedText type="smallBold">Current assistance</ThemedText>
        <ThemedText themeColor="textSecondary">
          {v3Learner?.assistanceMode === 'guided' ? 'Guided: automatic furigana and more English help.' : v3Learner?.assistanceMode === 'supported' ? 'Supported: Japanese first, with help on tap.' : 'Independent: Japanese first, with fewer hints.'}
        </ThemedText>
        <AppButton label="Reset V3 fresh-user flow" variant="secondary" onPress={confirmV3Reset} />
        <ThemedText type="small" themeColor="textSecondary">Only V3 learner state is removed.</ThemedText>
      </Card>

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

      <SectionHeading title="Review pacing" detail={`${newCardsPerDay} new cards daily`} />
      <Card>
        <ThemedText themeColor="textSecondary">Due reviews are always prioritised. This limit controls how many brand-new cards join each day’s queue.</ThemedText>
        <View style={styles.options} accessibilityRole="radiogroup">
          {newCardLimits.map((limit) => {
            const selected = newCardsPerDay === limit;
            return (
              <Pressable
                key={limit}
                accessibilityRole="radio"
                accessibilityLabel={`${limit} new cards per day`}
                accessibilityState={{ checked: selected }}
                onPress={() => void changeNewCards(limit)}
                style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}>
                <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{limit}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <AppButton label="Restore suspended cards" variant="quiet" onPress={() => void restoreSuspendedCards()} />
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

      <SectionHeading title="Japanese reading support" />
      <Card>
        <ThemedText themeColor="textSecondary">Japanese stays uncluttered by default. Tap a word or kanji whenever you want its reading and meaning.</ThemedText>
        <View style={styles.readingOptions} accessibilityRole="radiogroup">
          {furiganaOptions.map((option) => {
            const selected = furiganaPreference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${option.label}. ${option.detail}`}
                onPress={() => void changeFurigana(option.value)}
                style={[styles.readingOption, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}
              >
                <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{option.detail}</ThemedText>
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
        <ThemedText type="smallBold">Optional AI connection</ThemedText>
        <ThemedText themeColor="textSecondary">
          AI requests are sent only when you ask for help and only to your configured JapanGo backend. API keys never live on this device.
        </ThemedText>
      </Card>

      <SectionHeading title="AI teacher" />
      <Card>
        <ThemedText themeColor="textSecondary">AI help is optional. Canonical lessons and local progress continue to work if it is unavailable.</ThemedText>
        <AppButton label="Clear AI history and cache" variant="quiet" onPress={() => void clearAiData()} />
      </Card>

      <SectionHeading title="Legacy learning" />
      <Card>
        <ThemedText themeColor="textSecondary">The structured course, Lessons V2, and audio lessons are preserved but kept outside the V3 home flow.</ThemedText>
      </Card>

      <ThemedText type="small" themeColor="textSecondary" style={styles.version}>JapanGo · Phase 1 local foundation</ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: { minHeight: 46, minWidth: 72, borderRadius: Radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  themeOption: { flex: 1 },
  readingOptions: { gap: Spacing.two },
  readingOption: { borderRadius: Radius.medium, borderWidth: 1, gap: 2, minHeight: 58, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  divider: { height: 1, marginVertical: Spacing.one },
  version: { textAlign: 'center', marginTop: Spacing.two },
});
