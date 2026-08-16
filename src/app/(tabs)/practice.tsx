import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { PracticeInsightsPreview } from '@/components/google-practice/practice-insights-preview';
import { PracticePrivacyControls } from '@/components/google-practice/practice-privacy-controls';
import { PracticeSetupCard } from '@/components/google-practice/practice-setup-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteImportedPracticeHistory,
  getPracticeDashboard,
  setPracticePersonalizationEnabled,
} from '@/services/database/google-practice-repository';
import {
  chooseGooglePracticeDocument,
  connectGooglePracticeAccount,
  disconnectGooglePracticeAccount,
  GooglePracticeSyncError,
  syncGooglePractice,
} from '@/services/googlePracticeSync';
import { clearScheduledPracticeNotifications } from '@/services/notifications/notification-engine';
import type { PracticeDashboard } from '@/types/google-practice';

function formatTimestamp(value?: string): string {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not synced yet' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ChatGptPracticeScreen() {
  const theme = useTheme();
  const [dashboard, setDashboard] = useState<PracticeDashboard>();
  const [busy, setBusy] = useState<'connect' | 'choose' | 'sync'>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setDashboard(await getPracticeDashboard());
    } catch {
      setError('Your saved practice insights could not be opened. Please try again.');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (action: 'connect' | 'choose' | 'sync') => {
    if (busy) return;
    setBusy(action);
    setError(undefined);
    setMessage(undefined);
    try {
      if (action === 'connect') {
        await connectGooglePracticeAccount();
        setMessage('Google account connected. Choose the Doc used as your Practice Log.');
      } else if (action === 'choose') {
        await chooseGooglePracticeDocument();
        setMessage('Practice Log selected. Sync when your ChatGPT conversation has been added.');
      } else {
        const result = await syncGooglePractice();
        setMessage(result.newConversationCount
          ? `${result.newConversationCount} new ${result.newConversationCount === 1 ? 'conversation' : 'conversations'} processed.`
          : 'Your Practice Log is up to date.');
      }
      await load();
    } catch (caught) {
      setError(caught instanceof GooglePracticeSyncError ? caught.message : 'ChatGPT Practice could not complete that action. Please try again.');
    } finally {
      setBusy(undefined);
    }
  };

  const changePersonalization = async (enabled: boolean) => {
    try {
      await setPracticePersonalizationEnabled(enabled);
      await load();
      setMessage(enabled ? 'Conversation personalization is on.' : 'Conversation personalization is off. Your imported history is still available here.');
    } catch {
      setError('The personalization setting could not be updated.');
    }
  };

  const confirmDelete = () => Alert.alert(
    'Delete imported practice history?',
    'This removes imported conversations, corrections, vocabulary, and learner-profile evidence from this device. It does not change your Google Doc.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete history', style: 'destructive', onPress: () => {
        void clearScheduledPracticeNotifications().catch(() => undefined).then(deleteImportedPracticeHistory).then(async () => {
          setMessage('Imported practice history deleted. Your sync position was kept so old sessions are not re-imported.');
          await load();
        }).catch(() => setError('Imported practice history could not be deleted.'));
      } },
    ],
  );

  const confirmDisconnect = () => Alert.alert(
    'Disconnect Google?',
    'JapanGo will stop reading the selected Doc. Imported insights stay on this device until you delete them.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => {
        void disconnectGooglePracticeAccount().then(async () => {
          setMessage('Google disconnected.');
          await load();
        }).catch(() => setError('Google could not be disconnected.'));
      } },
    ],
  );

  if (!dashboard) return <ScreenContainer scroll={false}><LoadingState label="Opening your practice journal…" /></ScreenContainer>;

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="Conversation notebook"
        title="ChatGPT Practice"
        subtitle="Practice Japanese naturally with ChatGPT. Connect your practice log and JapanGo will learn from your conversations."
      />

      <PracticeSetupCard
        state={dashboard.state}
        busy={busy}
        onConnect={() => { void run('connect'); }}
        onChooseDocument={() => { void run('choose'); }}
        onSync={() => { void run('sync'); }}
      />

      {error || message ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.notice,
            { backgroundColor: error ? theme.errorSoft : theme.successSoft, borderColor: error ? theme.error : theme.success },
          ]}
        >
          <Ionicons name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={error ? theme.error : theme.success} />
          <ThemedText type="small" style={[styles.noticeText, { color: error ? theme.error : theme.success }]}>{error ?? message}</ThemedText>
        </View>
      ) : null}

      <View style={styles.syncRecord}>
        <SectionHeading title="Sync record" detail="Append-only and idempotent" />
        <View style={[styles.recordRule, { borderColor: theme.border }]}>
          <View style={styles.recordRow}>
            <ThemedText type="metadata" themeColor="textSecondary">Last synced</ThemedText>
            <ThemedText type="smallBold" style={styles.recordValue}>{formatTimestamp(dashboard.state.lastSyncedAt)}</ThemedText>
          </View>
          <View style={[styles.recordRow, styles.recordDivider, { borderColor: theme.border }]}>
            <ThemedText type="metadata" themeColor="textSecondary">New conversations</ThemedText>
            <ThemedText type="smallBold" style={styles.recordValue}>{dashboard.state.lastNewConversationCount}</ThemedText>
          </View>
        </View>
      </View>

      <PracticeInsightsPreview dashboard={dashboard} onOpenReview={() => router.push('/practice/review' as Href)} />

      <View style={styles.privacySection}>
        <SectionHeading title="Privacy & controls" detail="You stay in control" />
        <PracticePrivacyControls
          connected={dashboard.state.googleConnected}
          personalizationEnabled={dashboard.state.personalizationEnabled}
          onChangePersonalization={(enabled) => { void changePersonalization(enabled); }}
          onDeleteHistory={confirmDelete}
          onDisconnect={confirmDisconnect}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  noticeText: { flex: 1, minWidth: 0 },
  syncRecord: { gap: Spacing.three },
  recordRule: { borderBottomWidth: 1, borderTopWidth: 1 },
  recordRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 54, paddingVertical: Spacing.two },
  recordDivider: { borderTopWidth: 1 },
  recordValue: { flex: 1, minWidth: 0, textAlign: 'right' },
  privacySection: { gap: Spacing.three },
});
