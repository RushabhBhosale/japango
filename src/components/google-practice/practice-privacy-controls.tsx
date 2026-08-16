import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PracticePrivacyControlsProps {
  connected: boolean;
  personalizationEnabled: boolean;
  onChangePersonalization: (enabled: boolean) => void;
  onDeleteHistory: () => void;
  onDisconnect: () => void;
}

export function PracticePrivacyControls({
  connected,
  personalizationEnabled,
  onChangePersonalization,
  onDeleteHistory,
  onDisconnect,
}: PracticePrivacyControlsProps) {
  const theme = useTheme();
  return (
    <Card variant="quiet" style={styles.card}>
      <View style={styles.controlRow}>
        <View style={styles.controlCopy}>
          <ThemedText type="smallBold">Use practice for personalization</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Let conversation evidence shape homework, flashcards, lessons, readings, and reminders.
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel="Use conversation practice for personalization"
          accessibilityRole="switch"
          onValueChange={onChangePersonalization}
          thumbColor={personalizationEnabled ? theme.primary : theme.textSecondary}
          trackColor={{ false: theme.border, true: theme.primarySoft }}
          value={personalizationEnabled}
        />
      </View>
      <View style={[styles.note, { borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Only your selected Google Doc is read. Practice text is sent to JapanGo’s configured AI provider for analysis without your Google account identifiers.
        </ThemedText>
      </View>
      <AppButton label="Delete imported practice history" variant="danger" onPress={onDeleteHistory} />
      {connected ? (
        <Pressable
          accessibilityRole="button"
          onPress={onDisconnect}
          style={({ pressed }) => [styles.disconnect, pressed && { backgroundColor: theme.backgroundSelected }]}
        >
          <ThemedText type="smallBold" style={{ color: theme.error }}>Disconnect Google</ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  controlRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  controlCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  note: { borderBottomWidth: 1, borderTopWidth: 1, paddingVertical: Spacing.three },
  disconnect: { alignItems: 'center', borderRadius: Radius.medium, justifyContent: 'center', minHeight: 48, paddingHorizontal: Spacing.three },
});
