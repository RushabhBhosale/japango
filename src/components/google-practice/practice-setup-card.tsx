import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PracticeSyncState } from '@/types/google-practice';

interface PracticeSetupCardProps {
  state: PracticeSyncState;
  busy: 'connect' | 'choose' | 'sync' | undefined;
  onConnect: () => void;
  onChooseDocument: () => void;
  onSync: () => void;
}

function SetupRow({
  icon,
  title,
  detail,
  complete,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  complete: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.setupRow}>
      <View style={[styles.stepIcon, { backgroundColor: complete ? theme.successSoft : theme.backgroundElement }]}>
        <Ionicons name={complete ? 'checkmark' : icon} size={19} color={complete ? theme.success : theme.textSecondary} />
      </View>
      <View style={styles.rowCopy}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
      </View>
    </View>
  );
}

export function PracticeSetupCard({ state, busy, onConnect, onChooseDocument, onSync }: PracticeSetupCardProps) {
  const theme = useTheme();
  const hasDocument = Boolean(state.documentId);
  const primaryLabel = !state.googleConnected
    ? 'Connect Google account'
    : !hasDocument
      ? 'Choose Practice Log'
      : 'Sync now';
  const primaryAction = !state.googleConnected ? onConnect : !hasDocument ? onChooseDocument : onSync;
  const primaryBusy = !state.googleConnected ? busy === 'connect' : !hasDocument ? busy === 'choose' : busy === 'sync';

  return (
    <Card variant="accent" style={styles.card} accessibilityLabel="ChatGPT Practice connection">
      <View style={styles.heading}>
        <View style={[styles.documentMark, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="document-text-outline" size={25} color={theme.primary} />
        </View>
        <View style={styles.headingCopy}>
          <ThemedText type="heading">Your practice log</ThemedText>
          <ThemedText themeColor="textSecondary">
            JapanGo reads only the Google Doc you choose.
          </ThemedText>
        </View>
      </View>

      <View style={[styles.steps, { borderColor: theme.border }]}>
        <SetupRow
          icon="logo-google"
          title="Google account"
          detail={state.googleConnected ? 'Connected with per-file access' : 'Not connected'}
          complete={state.googleConnected}
        />
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <SetupRow
          icon="book-outline"
          title="JapanGo Practice Log"
          detail={state.documentTitle ?? (hasDocument ? 'Selected Google Doc' : 'No document selected')}
          complete={hasDocument}
        />
      </View>

      <AppButton label={primaryLabel} loading={primaryBusy} onPress={primaryAction} />
      {state.googleConnected && hasDocument ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change practice document"
          disabled={Boolean(busy)}
          onPress={onChooseDocument}
          style={({ pressed }) => [styles.changeButton, pressed && { backgroundColor: theme.backgroundSelected }]}
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={theme.primary} />
          <ThemedText type="smallBold" style={{ color: theme.primary }}>Change practice document</ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  heading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  headingCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  documentMark: { alignItems: 'center', borderRadius: Radius.medium, height: 52, justifyContent: 'center', width: 52 },
  steps: { borderBottomWidth: 1, borderTopWidth: 1 },
  setupRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minHeight: 72, paddingVertical: Spacing.twoHalf },
  stepIcon: { alignItems: 'center', borderRadius: Radius.pill, height: 34, justifyContent: 'center', width: 34 },
  rowCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  rule: { height: 1, marginLeft: 50 },
  changeButton: { alignItems: 'center', alignSelf: 'center', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, minHeight: 44, paddingHorizontal: Spacing.three },
});
