import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { LearningGoal, SelfReportedLevel } from '@/types/lesson-v3';

const goalOptions: { value: LearningGoal; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'jlpt', label: 'JLPT', icon: 'school-outline' },
  { value: 'conversation', label: 'Conversation', icon: 'chatbubbles-outline' },
  { value: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { value: 'anime-manga', label: 'Anime / manga', icon: 'book-outline' },
  { value: 'living-in-japan', label: 'Living in Japan', icon: 'home-outline' },
  { value: 'work-study', label: 'Work / study', icon: 'briefcase-outline' },
  { value: 'general-interest', label: 'General interest', icon: 'sparkles-outline' },
];

const levelOptions: { value: SelfReportedLevel; label: string; detail: string }[] = [
  { value: 'completely-new', label: 'Completely new', detail: 'I am starting from zero.' },
  { value: 'kana', label: 'Know hiragana / katakana', detail: 'I can read some kana.' },
  { value: 'n5', label: 'Around N5', detail: 'I know common words and basic grammar.' },
  { value: 'n4', label: 'Around N4', detail: 'I can follow short everyday Japanese.' },
  { value: 'n3-plus', label: 'N3+', detail: 'I am comfortable with intermediate Japanese.' },
  { value: 'not-sure', label: 'Not sure', detail: 'Let the short check help me decide.' },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const completeOnboarding = useAppStore((state) => state.completeV3Onboarding);
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<LearningGoal>();
  const [level, setLevel] = useState<SelfReportedLevel>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const finish = async () => {
    if (!goal || !level) return;
    setSaving(true);
    setError(undefined);
    try {
      await completeOnboarding(goal, level);
      router.replace('/assessment');
    } catch {
      setError('Your starting preferences could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.progress} accessibilityLabel={`Onboarding step ${step + 1} of 3`}>
        {[0, 1, 2].map((index) => <View key={index} style={[styles.dot, { backgroundColor: index <= step ? theme.primary : theme.border }]} />)}
      </View>

      {step === 0 ? (
        <View style={styles.welcome}>
          <View style={[styles.mark, { backgroundColor: theme.primarySoft }]} accessibilityLabel="JapanGo">
            <ThemedText style={[styles.markText, { color: theme.primary }]}>日</ThemedText>
          </View>
          <View style={styles.copy}>
            <ThemedText type="title">Japanese you can step into.</ThemedText>
            <ThemedText type="heading" themeColor="textSecondary">
              Learn through real situations, conversations, reading, listening, and stories.
            </ThemedText>
          </View>
          <View style={[styles.promise, { borderColor: theme.border }]}>
            <Ionicons name="phone-portrait-outline" size={24} color={theme.primary} />
            <ThemedText themeColor="textSecondary" style={styles.promiseText}>
              Your first story starts with one unexpected message.
            </ThemedText>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.copy}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>YOUR GOAL</ThemedText>
          <ThemedText type="title">Why are you learning Japanese?</ThemedText>
          <ThemedText themeColor="textSecondary">Choose the reason that matters most right now.</ThemedText>
          <View style={styles.goalGrid} accessibilityRole="radiogroup">
            {goalOptions.map((option) => {
              const selected = option.value === goal;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setGoal(option.value)}
                  style={[styles.goalOption, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}
                >
                  <Ionicons name={option.icon} size={22} color={selected ? theme.primary : theme.textSecondary} />
                  <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.copy}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>STARTING ESTIMATE</ThemedText>
          <ThemedText type="title">Where are you now?</ThemedText>
          <ThemedText themeColor="textSecondary">This only adjusts the starting support. The next short check will refine it.</ThemedText>
          <View style={styles.levelList} accessibilityRole="radiogroup">
            {levelOptions.map((option) => {
              const selected = option.value === level;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setLevel(option.value)}
                  style={[styles.levelOption, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}
                >
                  <View style={styles.levelCopy}>
                    <ThemedText type="smallBold" style={selected ? { color: theme.primary } : undefined}>{option.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{option.detail}</ThemedText>
                  </View>
                  <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.primary : theme.border} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {error ? <ThemedText style={{ color: theme.error }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
        <AppButton
          label={step === 0 ? 'Begin' : step === 1 ? 'Continue' : 'Start the short check'}
          disabled={(step === 1 && !goal) || (step === 2 && !level)}
          loading={saving}
          onPress={() => step < 2 ? setStep(step + 1) : void finish()}
        />
        {step > 0 ? <AppButton label="Back" variant="quiet" onPress={() => setStep(step - 1)} /> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between' },
  progress: { flexDirection: 'row', gap: Spacing.one, paddingTop: Spacing.one },
  dot: { flex: 1, height: 3, borderRadius: Radius.pill },
  welcome: { flex: 1, justifyContent: 'center', gap: Spacing.four },
  mark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 48, lineHeight: 58, fontWeight: '800' },
  copy: { gap: Spacing.three },
  promise: { borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  promiseText: { flex: 1 },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  goalOption: { width: '48%', minHeight: 82, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two, justifyContent: 'center' },
  levelList: { gap: Spacing.two },
  levelOption: { minHeight: 66, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  levelCopy: { flex: 1 },
  actions: { gap: Spacing.one, paddingTop: Spacing.three },
});
