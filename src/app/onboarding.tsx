import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const goalOptions = [5, 10, 15, 20];

export default function OnboardingScreen() {
  const theme = useTheme();
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const [name, setName] = useState('');
  const [dailyGoal, setDailyGoal] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const handleContinue = async () => {
    if (!name.trim()) {
      setError('Tell us what you would like to be called.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await completeOnboarding(name, dailyGoal);
      router.replace('/assessment');
    } catch {
      setError('Your profile could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer keyboardAware contentStyle={styles.content}>
      <View style={styles.mark} accessibilityLabel="JapanGo">
        <ThemedText style={[styles.markText, { color: theme.primary }]}>日</ThemedText>
      </View>
      <View style={styles.intro}>
        <ThemedText type="title">Let’s shape your daily Japanese practice.</ThemedText>
        <ThemedText themeColor="textSecondary">
          JapanGo keeps your learning plan and progress on this device. Start with a short N5 check-in.
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="smallBold">What should we call you?</ThemedText>
        <TextInput
          accessibilityLabel="Your name"
          autoCapitalize="words"
          maxLength={40}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          value={name}
        />

        <ThemedText type="smallBold" style={styles.goalLabel}>Daily study goal</ThemedText>
        <View style={styles.goalOptions} accessibilityRole="radiogroup">
          {goalOptions.map((minutes) => {
            const selected = minutes === dailyGoal;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={minutes}
                onPress={() => setDailyGoal(minutes)}
                style={[
                  styles.goalOption,
                  { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface },
                ]}>
                <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{minutes} min</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {error ? <ThemedText style={{ color: theme.error }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
      <AppButton label="Continue to skill check" loading={saving} onPress={() => void handleContinue()} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.privacy}>
        No account is needed. Phase 1 stores learning data locally and sends nothing to an AI provider.
      </ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center' },
  mark: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  markText: { fontSize: 48, fontWeight: '800' },
  intro: { gap: Spacing.two },
  input: { minHeight: 50, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 14, fontSize: 17 },
  goalLabel: { marginTop: Spacing.two },
  goalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  goalOption: { minHeight: 46, minWidth: 72, borderWidth: 1, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  privacy: { textAlign: 'center' },
});
