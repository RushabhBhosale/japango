import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

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
import { defaultNotificationPreferences, getNotificationPreferences } from '@/services/database/notification-repository';
import { registerYuiPushNotifications } from '@/services/notifications/ai-chat-notifications';
import {
  clearScheduledJapanGoNotifications,
  getJapanGoNotificationDiagnostics,
  requestJapanGoNotificationPermission,
  scheduleDailyJapanGoNotifications,
  sendJapanGoNotificationTest,
  updateJapanGoNotificationPreferences,
} from '@/services/notifications/notification-engine';
import { useAppStore } from '@/store/app-store';
import type { FuriganaPreference, ThemePreference } from '@/types/learning';
import type { NotificationDiagnostics, NotificationFrequency, NotificationPreferences, NotificationType } from '@/types/notifications';

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
const notificationFrequencyOptions: { value: NotificationFrequency; label: string; detail: string }[] = [
  { value: 'light', label: 'Light', detail: '2–3 useful reminders' },
  { value: 'normal', label: 'Normal', detail: '3–4 useful reminders' },
  { value: 'frequent', label: 'Frequent', detail: '5–6 useful reminders' },
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
  const [notificationPreferences, setNotificationPreferencesState] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [notificationDiagnostics, setNotificationDiagnostics] = useState<NotificationDiagnostics>();

  useEffect(() => {
    void getFsrsQueueLimits().then((limits) => setNewCardsPerDay(limits.newCardsPerDay)).catch(() => undefined);
    void getFuriganaPreference().then(setFuriganaPreferenceState).catch(() => undefined);
    void getNotificationPreferences().then(setNotificationPreferencesState).catch(() => undefined);
    void getJapanGoNotificationDiagnostics().then(setNotificationDiagnostics).catch(() => undefined);
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

  const refreshNotificationDiagnostics = async () => {
    try { setNotificationDiagnostics(await getJapanGoNotificationDiagnostics()); } catch { setMessage('Notification diagnostics could not be loaded.'); }
  };

  const changeNotificationPreferences = async (next: NotificationPreferences) => {
    setMessage(undefined);
    try {
      const result = await updateJapanGoNotificationPreferences(next);
      setNotificationPreferencesState(result.preferences);
      if (result.preferences.enabled && result.preferences.aiChat && profile?.id) {
        void registerYuiPushNotifications(profile.id).catch(() => undefined);
      }
      setMessage(result.permission === 'granted' || !next.enabled
        ? 'Notification preferences updated.'
        : 'Notifications are disabled in device settings. You can enable them there when ready.');
      await refreshNotificationDiagnostics();
    } catch {
      setMessage('Notification preferences could not be updated.');
    }
  };

  const runNotificationTest = async (type: NotificationType, delaySeconds = 10) => {
    try {
      const result = await sendJapanGoNotificationTest({ type, delaySeconds });
      setMessage(result ? `Test ${type.replaceAll('_', ' ')} is scheduled.` : 'JapanGo needs notification permission before it can send a test.');
      await refreshNotificationDiagnostics();
    } catch {
      setMessage('That notification test could not be scheduled.');
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

      <SectionHeading title="Notifications" detail={notificationPreferences.enabled ? 'On' : 'Off'} />
      <Card>
        <ThemedText themeColor="textSecondary">Allow JapanGo to send daily Japanese practice, review reminders and messages from your Japanese chat.</ThemedText>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: notificationPreferences.enabled }}
          onPress={() => { void changeNotificationPreferences({ ...notificationPreferences, enabled: !notificationPreferences.enabled }); }}
          style={[styles.notificationToggle, { borderColor: notificationPreferences.enabled ? theme.primary : theme.border, backgroundColor: notificationPreferences.enabled ? theme.primarySoft : theme.surface }]}
        >
          <View><ThemedText type="smallBold">Enabled</ThemedText><ThemedText type="small" themeColor="textSecondary">Ask only when you turn reminders on.</ThemedText></View>
          <Ionicons name={notificationPreferences.enabled ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={notificationPreferences.enabled ? theme.primary : theme.textSecondary} />
        </Pressable>
        <View style={styles.notificationRows}>
          {([
            ['aiChat', 'AI chat messages'],
            ['dailyHomework', 'Daily homework'],
            ['reviews', 'Reviews'],
            ['learningTips', 'Learning tips'],
          ] as const).map(([key, label]) => (
            <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: notificationPreferences[key] }} onPress={() => { void changeNotificationPreferences({ ...notificationPreferences, [key]: !notificationPreferences[key] }); }} style={({ pressed }) => [styles.notificationRow, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.surface }]}>
              <ThemedText type="smallBold">{label}</ThemedText>
              <Ionicons name={notificationPreferences[key] ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={notificationPreferences[key] ? theme.primary : theme.textSecondary} />
            </Pressable>
          ))}
        </View>
        <ThemedText type="smallBold">Frequency</ThemedText>
        <View style={styles.options} accessibilityRole="radiogroup">
          {notificationFrequencyOptions.map((option) => {
            const selected = notificationPreferences.frequency === option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { void changeNotificationPreferences({ ...notificationPreferences, frequency: option.value }); }} style={[styles.option, styles.frequencyOption, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{option.detail}</ThemedText></Pressable>;
          })}
        </View>
        <ThemedText type="smallBold">Active hours</ThemedText>
        <View style={styles.options} accessibilityRole="radiogroup">
          {[{ start: 9, end: 21, label: '09:00–21:00' }, { start: 10, end: 20, label: '10:00–20:00' }].map((option) => {
            const selected = notificationPreferences.activeHours.start === option.start && notificationPreferences.activeHours.end === option.end;
            return <Pressable key={option.label} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { void changeNotificationPreferences({ ...notificationPreferences, activeHours: { start: option.start, end: option.end } }); }} style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText></Pressable>;
          })}
        </View>
        <AppButton
          accessibilityLabel="Send a test notification in 5 seconds"
          label="Send test notification"
          variant="secondary"
          onPress={() => { void runNotificationTest('micro_vocabulary', 5); }}
        />
        <ThemedText type="small" themeColor="textSecondary">Sends a sample word with its meaning in 5 seconds.</ThemedText>
      </Card>

      {__DEV__ ? <>
        <SectionHeading title="Developer" detail="Notification testing" />
        <Card>
          <ThemedText type="smallBold">Permission: {notificationDiagnostics?.permission ?? 'checking'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Notifications today: {notificationDiagnostics?.sentToday ?? 0} / 6 · Daily target: {notificationDiagnostics?.dailyTarget ?? 4}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Homework: {notificationDiagnostics?.homework.completed ?? 0} / {notificationDiagnostics?.homework.total ?? 0} · Reviews due: {notificationDiagnostics?.reviewsDue ?? 0}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Last app activity: {notificationDiagnostics?.lastAppActivity ? new Date(notificationDiagnostics.lastAppActivity).toLocaleTimeString() : '—'}</ThemedText>
          <AppButton label="Request permission" variant="secondary" onPress={() => { void requestJapanGoNotificationPermission().then(refreshNotificationDiagnostics); }} />
          <View style={styles.testButtons}>
            <AppButton label="Send now" variant="quiet" onPress={() => { void runNotificationTest('daily_homework', 1); }} />
            <AppButton label="Send in 10 seconds" variant="quiet" onPress={() => { void runNotificationTest('daily_homework', 10); }} />
            <AppButton label="Send in 1 minute" variant="quiet" onPress={() => { void runNotificationTest('daily_homework', 60); }} />
            <AppButton label="Test homework" variant="quiet" onPress={() => { void runNotificationTest('daily_homework'); }} />
            <AppButton label="Test vocabulary" variant="quiet" onPress={() => { void runNotificationTest('micro_vocabulary'); }} />
            <AppButton label="Test kanji" variant="quiet" onPress={() => { void runNotificationTest('micro_kanji'); }} />
            <AppButton label="Test mistake review" variant="quiet" onPress={() => { void runNotificationTest('mistake_review'); }} />
            <AppButton label="Test AI chat" variant="quiet" onPress={() => { void runNotificationTest('ai_chat'); }} />
            <AppButton label="Test chat deep link" variant="quiet" onPress={() => { void runNotificationTest('ai_chat', 10); }} />
          </View>
          <AppButton label="Generate today’s schedule" variant="secondary" onPress={() => { void scheduleDailyJapanGoNotifications().then(refreshNotificationDiagnostics).catch(() => setMessage('Today’s schedule could not be generated.')); }} />
          <AppButton label="View scheduled notifications" variant="quiet" onPress={() => { void refreshNotificationDiagnostics(); }} />
          <AppButton label="View today’s notification log" variant="quiet" onPress={() => { void refreshNotificationDiagnostics(); }} />
          <AppButton label="Clear scheduled notifications" variant="quiet" onPress={() => { void clearScheduledJapanGoNotifications().then(refreshNotificationDiagnostics); }} />
          {notificationDiagnostics?.nextScheduled.length ? <View style={styles.diagnosticsList}>{notificationDiagnostics.nextScheduled.map((entry) => <ThemedText key={entry.id} type="small" themeColor="textSecondary">{new Date(entry.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.type}</ThemedText>)}</View> : <ThemedText type="small" themeColor="textSecondary">No scheduled notifications.</ThemedText>}
          {notificationDiagnostics?.lastNotification ? <ThemedText type="small" themeColor="textSecondary">Last notification: {new Date(notificationDiagnostics.lastNotification.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {notificationDiagnostics.lastNotification.type}</ThemedText> : null}
          {notificationDiagnostics?.todayLog.length ? <View style={styles.diagnosticsList}>{notificationDiagnostics.todayLog.map((entry) => <ThemedText key={entry.id} type="small" themeColor="textSecondary">{new Date(entry.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.type} · {entry.status}</ThemedText>)}</View> : <ThemedText type="small" themeColor="textSecondary">Today’s notification log is empty.</ThemedText>}
        </Card>
      </> : null}

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
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minWidth: 0 },
  option: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, justifyContent: 'center', maxWidth: '100%', minHeight: 46, minWidth: 72, paddingHorizontal: 12 },
  themeOption: { flexBasis: 84, flexGrow: 1 },
  readingOptions: { gap: Spacing.two },
  readingOption: { borderRadius: Radius.medium, borderWidth: 1, gap: Spacing.one, minHeight: 64, minWidth: 0, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  notificationToggle: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  notificationRows: { gap: Spacing.one },
  notificationRow: { alignItems: 'center', borderRadius: Radius.small, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: Spacing.two },
  frequencyOption: { alignItems: 'flex-start', flexGrow: 1, minWidth: 100 },
  testButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  diagnosticsList: { gap: Spacing.half },
  divider: { height: 1, marginVertical: Spacing.one },
  version: { textAlign: 'center', marginTop: Spacing.two },
});
