import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/themed-text';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { Radius, Spacing } from '@/constants/theme';
import type { EpisodeOneConversationTurn } from '@/features/lesson-v3/episode-one-conversation';
import { useTheme } from '@/hooks/use-theme';
import type {
  AssistanceMode,
  V3ChoiceScene,
  V3EpisodeResponse,
  V3FreeResponseScene,
  V3SentenceBuildScene,
  V3StoryChoices,
} from '@/types/lesson-v3';

import { V3Chat } from './v3-chat';
import { V3EpisodeOneConversation } from './v3-episode-one-conversation';
import { V3JapaneseLineView } from './v3-japanese-line';

interface SharedInteractionProps {
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
  storyChoices?: V3StoryChoices;
  response?: V3EpisodeResponse;
  onSubmit: (response: V3EpisodeResponse) => Promise<void>;
  onDynamicReply?: (answer: string, forceCheckpoint: boolean) => Promise<EpisodeOneConversationTurn>;
}

export function V3ChoiceInteraction({ scene, assistanceMode, glossary, response, onSubmit }: SharedInteractionProps & { scene: V3ChoiceScene }) {
  const theme = useTheme();
  const [selected, setSelected] = useState<string>(response?.answer ?? '');
  const [saving, setSaving] = useState(false);
  const option = scene.options.find((candidate) => candidate.id === selected);

  const confirm = async () => {
    if (!option || response) return;
    setSaving(true);
    await onSubmit({
      sceneId: scene.id,
      kind: 'choice',
      answer: option.id,
      correct: option.correct,
      feedbackTitle: option.correct ? 'That fits' : 'Not quite',
      feedback: option.feedback,
    });
    setSaving(false);
  };

  return (
    <View style={styles.section}>
      {scene.context ? (
        <Card variant="quiet">
          <V3JapaneseLineView line={scene.context} assistanceMode={assistanceMode} glossary={glossary} showAudio />
        </Card>
      ) : null}
      <ThemedText type="heading">{scene.prompt}</ThemedText>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {scene.options.map((candidate) => {
          const isSelected = candidate.id === selected;
          const isCorrectAnswer = response && candidate.correct;
          const isWrongSelection = response && isSelected && !candidate.correct;
          const borderColor = isCorrectAnswer ? theme.success : isWrongSelection ? theme.error : isSelected ? theme.primary : theme.border;
          return (
            <Pressable
              key={candidate.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: Boolean(response) }}
              disabled={Boolean(response)}
              onPress={() => setSelected(candidate.id)}
              style={[styles.option, { borderColor, backgroundColor: isSelected ? theme.primarySoft : theme.surface }]}
            >
              {candidate.line
                ? <V3JapaneseLineView line={candidate.line} assistanceMode={assistanceMode} glossary={glossary} type="default" />
                : <InteractiveJapaneseText>{candidate.label}</InteractiveJapaneseText>}
            </Pressable>
          );
        })}
      </View>
      {response ? <Feedback response={response} /> : <AppButton label="Send reply" disabled={!selected} loading={saving} onPress={() => void confirm()} />}
    </View>
  );
}

export function V3SentenceBuildInteraction({ scene, assistanceMode, glossary, response, onSubmit }: SharedInteractionProps & { scene: V3SentenceBuildScene }) {
  const theme = useTheme();
  const [order, setOrder] = useState<string[]>(response ? scene.correctOrder : []);
  const [saving, setSaving] = useState(false);
  const available = scene.parts.filter((part) => !order.includes(part.id));
  const built = order.map((id) => scene.parts.find((part) => part.id === id)?.text ?? '').join('');

  const confirm = async () => {
    const correct = order.join('|') === scene.correctOrder.join('|');
    setSaving(true);
    await onSubmit({
      sceneId: scene.id,
      kind: 'sentenceBuild',
      answer: built,
      correct,
      feedbackTitle: correct ? 'Nice reply' : 'Almost',
      feedback: correct ? scene.explanation : `A natural order is ${scene.answer.text.raw}. ${scene.explanation}`,
      suggestedResponse: correct ? undefined : scene.answer.text.raw,
    });
    setSaving(false);
  };

  return (
    <View style={styles.section}>
      <ThemedText type="heading">{scene.prompt}</ThemedText>
      <View style={[styles.buildArea, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {order.length ? order.map((id) => {
          const part = scene.parts.find((candidate) => candidate.id === id);
          return <Pressable key={id} disabled={Boolean(response)} onPress={() => setOrder((current) => current.filter((candidate) => candidate !== id))} style={[styles.wordChip, { backgroundColor: theme.primarySoft }]}><InteractiveJapaneseText type="heading" style={styles.chipText}>{part?.text}</InteractiveJapaneseText></Pressable>;
        }) : <ThemedText themeColor="textSecondary">Tap the pieces below</ThemedText>}
      </View>
      <View style={styles.chips}>
        {available.map((part) => <Pressable key={part.id} onPress={() => setOrder((current) => [...current, part.id])} style={[styles.wordChip, { borderColor: theme.border, backgroundColor: theme.surface }]}><InteractiveJapaneseText type="heading" style={styles.chipText}>{part.text}</InteractiveJapaneseText></Pressable>)}
      </View>
      {response ? (
        <>
          <Feedback response={response} />
          {!response.correct ? <V3JapaneseLineView line={scene.answer} assistanceMode={assistanceMode} glossary={glossary} /> : null}
        </>
      ) : <AppButton label="Check reply" disabled={order.length !== scene.parts.length} loading={saving} onPress={() => void confirm()} />}
    </View>
  );
}

export function V3FreeResponseInteraction(props: SharedInteractionProps & { scene: V3FreeResponseScene }) {
  const { scene, assistanceMode, glossary, storyChoices, response, onDynamicReply } = props;
  if (scene.intent === 'episode-one-availability' && storyChoices && onDynamicReply) {
    return <V3EpisodeOneConversation scene={scene} assistanceMode={assistanceMode} glossary={glossary} storyChoices={storyChoices} response={response} onReply={onDynamicReply} />;
  }
  return <StandardFreeResponseInteraction {...props} />;
}

function StandardFreeResponseInteraction({ scene, assistanceMode, glossary, response, onSubmit }: SharedInteractionProps & { scene: V3FreeResponseScene }) {
  const theme = useTheme();
  const [answer, setAnswer] = useState(response?.answer ?? '');
  const [saving, setSaving] = useState(false);
  const starters = useMemo(() => assistanceMode === 'independent' ? [] : scene.suggestedStarters, [assistanceMode, scene.suggestedStarters]);

  const submit = async () => {
    if (!answer.trim()) return;
    setSaving(true);
    await onSubmit({
      sceneId: scene.id,
      kind: 'freeResponse',
      answer: answer.trim(),
      correct: false,
      feedbackTitle: 'Checking your message…',
      feedback: 'Your reply is being checked.',
    });
    setSaving(false);
  };

  return (
    <View style={styles.section}>
      <V3Chat messages={[scene.message]} assistanceMode={assistanceMode} glossary={glossary} />
      <ThemedText type="heading">{scene.prompt}</ThemedText>
      {starters.length && !response ? (
        <View style={styles.chips}>
          {starters.map((starter) => <Pressable key={starter} onPress={() => setAnswer(starter)} style={[styles.starter, { borderColor: theme.border }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>{starter}</ThemedText></Pressable>)}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel="Reply to Yuki in Japanese"
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
      {response ? <Feedback response={response} /> : null}
      {!response?.correct ? <AppButton label={response ? 'Try this reply again' : 'Send to Yuki'} disabled={!answer.trim()} loading={saving} onPress={() => void submit()} /> : null}
    </View>
  );
}

function Feedback({ response }: { response: V3EpisodeResponse }) {
  const theme = useTheme();
  return (
    <Card style={{ backgroundColor: response.correct ? theme.successSoft : theme.warningSoft }}>
      <ThemedText type="heading" style={{ color: response.correct ? theme.success : theme.warning }}>{response.feedbackTitle}</ThemedText>
      <ThemedText>{response.feedback}</ThemedText>
      {response.suggestedResponse ? <InteractiveJapaneseText type="japanese">{response.suggestedResponse}</InteractiveJapaneseText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three, minWidth: 0 },
  options: { gap: Spacing.two },
  option: { borderRadius: Radius.medium, borderWidth: 1, justifyContent: 'center', minHeight: 58, minWidth: 0, padding: Spacing.three, width: '100%' },
  buildArea: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minHeight: 90, minWidth: 0, padding: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minWidth: 0 },
  wordChip: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, justifyContent: 'center', maxWidth: '100%', minHeight: 48, minWidth: 0, paddingHorizontal: Spacing.three },
  chipText: { maxWidth: '100%', minWidth: 0, textAlign: 'center' },
  starter: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center', maxWidth: '100%', minHeight: 44, minWidth: 0, paddingHorizontal: Spacing.three },
  input: { borderRadius: Radius.medium, borderWidth: 1, fontSize: 20, lineHeight: 32, maxWidth: '100%', minHeight: 112, minWidth: 0, padding: Spacing.three, textAlignVertical: 'top', width: '100%' },
});
