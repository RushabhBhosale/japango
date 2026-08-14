import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  episodeOneConversationPhase,
  learnerEnteredLine,
  type EpisodeOneConversationTurn,
  type EpisodeOneLanguageFeedback,
} from '@/features/lesson-v3/episode-one-conversation';
import { useTheme } from '@/hooks/use-theme';
import type { AssistanceMode, V3EpisodeResponse, V3FreeResponseScene, V3StoryChoices } from '@/types/lesson-v3';

import { V3Chat } from './v3-chat';

interface EpisodeOneConversationProps {
  scene: V3FreeResponseScene;
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
  storyChoices: V3StoryChoices;
  response?: V3EpisodeResponse;
  onReply: (answer: string, forceCheckpoint: boolean) => Promise<EpisodeOneConversationTurn>;
}

export function V3EpisodeOneConversation({ scene, assistanceMode, glossary, storyChoices, response, onReply }: EpisodeOneConversationProps) {
  const theme = useTheme();
  const phase = episodeOneConversationPhase(storyChoices);
  const [answer, setAnswer] = useState('');
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [turn, setTurn] = useState<EpisodeOneConversationTurn>();
  const [saving, setSaving] = useState(false);
  const starters = useMemo(() => assistanceMode === 'independent' ? [] : scene.suggestedStarters, [assistanceMode, scene.suggestedStarters]);

  const yukiReply = turn?.yukiReply;
  const messages = [
    scene.message,
    ...sentMessages.map((message, index) => ({ id: `learner-${index}`, sender: 'learner' as const, line: learnerEnteredLine(message) })),
    ...(yukiReply ? [yukiReply] : []),
  ];
  const prompt = turn?.requiresFollowUp
    ? 'Reply to Yuki in Japanese.'
    : phase === 'finish-time'
    ? 'Tell Yuki roughly what time work finishes.'
    : scene.prompt;

  const submit = async () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setSaving(true);
    setSentMessages((current) => [...current, trimmed]);
    const nextTurn = await onReply(trimmed, sentMessages.length >= 1);
    setTurn(nextTurn);
    setAnswer('');
    setSaving(false);
  };

  return (
    <View style={styles.section}>
      <V3Chat messages={messages} assistanceMode={assistanceMode} glossary={glossary} />
      <ThemedText type="heading">{prompt}</ThemedText>
      {starters.length && !response && phase === 'availability' ? (
        <View style={styles.chips}>
          {starters.map((starter) => <Pressable key={starter.text} onPress={() => setAnswer(starter.text)} style={[styles.starter, { borderColor: theme.border }]}><InteractiveJapaneseText type="smallBold" contextualReading={starter.contextualReading} style={{ color: theme.primary }}>{starter.text}</InteractiveJapaneseText></Pressable>)}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={phase === 'finish-time' ? 'Tell Yuki when work finishes in Japanese' : 'Reply to Yuki in Japanese'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!response?.correct}
        multiline
        maxLength={160}
        placeholder="日本語で返信…"
        placeholderTextColor={theme.textSecondary}
        value={answer}
        onChangeText={setAnswer}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
      />
      {turn && !response?.correct ? <LanguageFeedback feedback={turn.feedback} /> : null}
      {response?.correct ? <LanguageFeedback feedback={{ title: response.feedbackTitle, feedback: response.feedback, suggestedResponse: response.suggestedResponse }} /> : null}
      {!response?.correct ? <AppButton label={phase === 'finish-time' ? 'Tell Yuki' : 'Send to Yuki'} disabled={!answer.trim()} loading={saving} onPress={() => void submit()} /> : null}
    </View>
  );
}

function LanguageFeedback({ feedback }: { feedback: EpisodeOneLanguageFeedback }) {
  const theme = useTheme();
  return (
    <Card style={[styles.feedback, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>{feedback.title}</ThemedText>
      <ThemedText type="small">{feedback.feedback}</ThemedText>
      {feedback.suggestedResponse ? <ThemedText type="smallBold">{feedback.suggestedResponse}</ThemedText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minWidth: 0 },
  starter: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center', maxWidth: '100%', minHeight: 44, minWidth: 0, paddingHorizontal: Spacing.three },
  input: { borderRadius: Radius.medium, borderWidth: 1, fontSize: 20, lineHeight: 32, maxWidth: '100%', minHeight: 112, minWidth: 0, padding: Spacing.three, textAlignVertical: 'top', width: '100%' },
  feedback: { gap: Spacing.one },
});
