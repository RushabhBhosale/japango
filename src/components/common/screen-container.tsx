import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenContainerProps extends PropsWithChildren {
  scroll?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenContainer({
  children,
  scroll = true,
  keyboardAware = false,
  contentStyle,
  testID,
}: ScreenContainerProps) {
  const theme = useTheme();
  const content = (
    <View style={styles.centerer}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );

  const body = scroll ? (
    <ScrollView
      testID={testID}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  ) : (
    <View testID={testID} style={[styles.fixed, { backgroundColor: theme.background }]}>
      {content}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.fixed}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  fixed: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centerer: { flex: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
});
