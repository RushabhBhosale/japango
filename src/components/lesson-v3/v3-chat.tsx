import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AssistanceMode, V3ChatMessage } from '@/types/lesson-v3';

import { V3JapaneseLineView } from './v3-japanese-line';

interface V3ChatProps {
  messages: V3ChatMessage[];
  assistanceMode: AssistanceMode;
  glossary: Record<string, { reading: string; meaning: string }>;
}

function ChatBubble({ message, index, assistanceMode, glossary }: V3ChatProps & { message: V3ChatMessage; index: number }) {
  const theme = useTheme();
  const [animation] = useState(() => new Animated.Value(0));
  const isLearner = message.sender === 'learner';
  const name = message.sender === 'unknown' ? 'Unknown' : message.sender === 'yuki' ? 'ゆき' : 'You';

  useEffect(() => {
    Animated.timing(animation, { toValue: 1, duration: 220, delay: index * 90, useNativeDriver: true }).start();
  }, [animation, index]);

  return (
    <Animated.View style={[styles.messageRow, isLearner && styles.learnerRow, { opacity: animation, transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {!isLearner ? (
        <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{message.sender === 'unknown' ? '?' : 'ゆ'}</ThemedText>
        </View>
      ) : null}
      <View style={styles.bubbleColumn}>
        <ThemedText type="small" themeColor="textSecondary" style={isLearner ? styles.learnerName : undefined}>{name}</ThemedText>
        <View style={[styles.bubble, { backgroundColor: isLearner ? theme.primarySoft : theme.surface, borderColor: isLearner ? theme.primary : theme.border }]}>
          <V3JapaneseLineView line={message.line} assistanceMode={assistanceMode} glossary={glossary} showAudio={!isLearner} />
        </View>
        {message.time ? <ThemedText type="small" themeColor="textSecondary">{message.time}</ThemedText> : null}
      </View>
    </Animated.View>
  );
}

export function V3Chat({ messages, assistanceMode, glossary }: V3ChatProps) {
  return (
    <View style={styles.chat}>
      {messages.map((message, index) => (
        <ChatBubble key={message.id} message={message} index={index} messages={messages} assistanceMode={assistanceMode} glossary={glossary} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { gap: Spacing.three },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, maxWidth: '92%' },
  learnerRow: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  bubbleColumn: { flexShrink: 1, gap: Spacing.one },
  learnerName: { textAlign: 'right' },
  bubble: { borderWidth: 1, borderRadius: Radius.large, paddingHorizontal: Spacing.three, paddingVertical: 12 },
});
