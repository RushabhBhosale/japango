import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

interface ChatAvatarProps {
  size?: number;
  online?: boolean;
}

export function ChatAvatar({ size = 46, online = false }: ChatAvatarProps) {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: theme.primarySoft, height: size, width: size }]} accessible accessibilityLabel="Yui’s avatar">
      <ThemedText type="cardTitle" style={{ color: theme.primary }}>ゆ</ThemedText>
      {online ? <View style={[styles.online, { backgroundColor: theme.success, borderColor: theme.surface }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: Radius.pill, justifyContent: 'center', position: 'relative' },
  online: { borderRadius: Radius.pill, borderWidth: 2, bottom: 0, height: 13, position: 'absolute', right: -1, width: 13 },
});
