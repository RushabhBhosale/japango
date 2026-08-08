import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function AssessmentResultScreen() {
  const theme = useTheme();
  const v3Learner = useAppStore((state) => state.v3Learner);
  const result = v3Learner?.assessmentResult;

  if (!v3Learner?.assessmentCompleted || !result) return <Redirect href="/assessment" />;

  const skills = [
    { label: 'Kana', value: result.kana },
    { label: 'Kanji', value: result.kanji },
    { label: 'Grammar', value: result.grammar },
    { label: 'Reading', value: result.reading },
  ];
  const assistanceLabel = result.assistanceMode === 'guided'
    ? 'More furigana, English, and reply support'
    : result.assistanceMode === 'supported'
      ? 'Japanese first, with help one tap away'
      : 'Japanese first, with fewer automatic hints';

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.hero}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>YOUR STARTING POINT</ThemedText>
        <ThemedText type="title">{result.startingLevel}</ThemedText>
        <ThemedText themeColor="textSecondary">
          A useful starting estimate—not a permanent label. The story will keep adapting as you respond.
        </ThemedText>
      </View>

      <Card style={[styles.skillCard, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
        {skills.map((skill, index) => (
          <View key={skill.label} style={[styles.skillRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <ThemedText type="small" themeColor="textSecondary">{skill.label}</ThemedText>
            <ThemedText type="smallBold" style={styles.skillValue}>{skill.value}</ThemedText>
          </View>
        ))}
      </Card>

      <Card>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>EPISODE ASSISTANCE</ThemedText>
        <ThemedText type="heading">{assistanceLabel}</ThemedText>
        <ThemedText themeColor="textSecondary">
          You can still inspect any Japanese word while reading the conversation.
        </ThemedText>
      </Card>

      <AppButton label="Open my first story" onPress={() => router.replace('/(tabs)')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center' },
  hero: { gap: Spacing.two },
  skillCard: { paddingVertical: Spacing.one, borderRadius: Radius.large },
  skillRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: Spacing.two },
  skillValue: { flex: 1, textAlign: 'right' },
});
