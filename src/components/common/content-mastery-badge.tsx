import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ContentMasteryAssessment } from '@/types/content-mastery';

const labels: Record<ContentMasteryAssessment['state'], string> = {
  not_started: 'Not started',
  studying: 'Studying',
  needs_review: 'Needs review',
  good: 'Good',
  mastered: 'Mastered',
};

export function ContentMasteryBadge({ assessment }: { assessment: ContentMasteryAssessment }) {
  const theme = useTheme();
  const warning = assessment.state === 'needs_review';
  const success = assessment.state === 'good' || assessment.state === 'mastered';
  const color = warning ? theme.warning : success ? theme.success : theme.primary;
  const backgroundColor = warning ? theme.warningSoft : success ? theme.successSoft : theme.primarySoft;
  return <View accessibilityLabel={`${labels[assessment.state]}: ${assessment.reason}`} style={[styles.badge, { backgroundColor }]}><ThemedText type="smallBold" style={{ color }}>{labels[assessment.state]}</ThemedText></View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
});
