import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
}

export function ChatComposer({ value, disabled, onChangeText, onSend }: ChatComposerProps) {
  const theme = useTheme();
  const sendDisabled = disabled || !value.trim();
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={[styles.inputShell, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <TextInput
          accessibilityLabel="Message Yui"
          accessibilityHint="Write in Japanese or English. Yui will continue the conversation naturally."
          editable={!disabled}
          multiline
          onChangeText={onChangeText}
          placeholder="Message ゆい"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          style={[styles.input, { color: theme.text }]}
          value={value}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: sendDisabled }}
        disabled={sendDisabled}
        hitSlop={4}
        onPress={onSend}
        style={({ pressed }) => [styles.send, { backgroundColor: sendDisabled ? theme.backgroundElement : theme.primary }, pressed && !sendDisabled && { backgroundColor: theme.primaryPressed }]}
      >
        <Ionicons name="send" size={20} color={sendDisabled ? theme.textSecondary : theme.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end', borderTopWidth: 1, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  inputShell: { borderRadius: Radius.medium, borderWidth: 1, flex: 1, maxHeight: 132, minHeight: 48 },
  input: { fontSize: 16, lineHeight: 22, maxHeight: 116, minHeight: 48, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  send: { alignItems: 'center', borderRadius: Radius.medium, height: 48, justifyContent: 'center', width: 48 },
});
