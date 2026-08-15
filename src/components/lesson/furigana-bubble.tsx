import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface FuriganaBubbleProps {
  reading: string;
}

/** A non-layout overlay used above an interactive kanji word. */
export function FuriganaBubble({ reading }: FuriganaBubbleProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.anchor}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.surface,
            borderColor: theme.primary,
            shadowColor: theme.text,
          },
        ]}
      >
        <ThemedText
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[styles.reading, { color: theme.primary }]}
        >
          {reading}
        </ThemedText>
        <View
          style={[
            styles.tail,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.primary,
              borderRightColor: theme.primary,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    alignItems: 'center',
    bottom: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    transform: [{ translateY: -5 }],
    zIndex: 20,
  },
  bubble: {
    alignSelf: 'center',
    borderRadius: Radius.small,
    borderWidth: 1,
    elevation: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'relative',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
  },
  reading: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    // The shared text style caps width at 100% of its kanji anchor. A large
    // cap lets the bubble follow the complete reading instead of wrapping
    // within the written word; numberOfLines keeps extreme content on one row.
    maxWidth: 1000,
    textAlign: 'center',
  },
  tail: {
    borderBottomWidth: 1,
    borderRightWidth: 1,
    bottom: -4,
    height: 7,
    left: '50%',
    marginLeft: -3.5,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
});
