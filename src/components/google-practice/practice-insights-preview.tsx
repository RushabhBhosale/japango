import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PracticeDashboard } from '@/types/google-practice';

interface PracticeInsightsPreviewProps {
  dashboard: PracticeDashboard;
  onOpenReview: () => void;
}

function InsightRow({
  icon,
  label,
  detail,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail: string;
  last: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineMarker}>
        <View style={[styles.dot, { backgroundColor: theme.primary }]} />
        {!last ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
      </View>
      <View style={[styles.insightCopy, !last && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
        <View style={styles.insightLabel}>
          <Ionicons name={icon} size={17} color={theme.primary} />
          <ThemedText type="smallBold">{label}</ThemedText>
        </View>
        <ThemedText themeColor="textSecondary">{detail}</ThemedText>
      </View>
    </View>
  );
}

export function PracticeInsightsPreview({ dashboard, onOpenReview }: PracticeInsightsPreviewProps) {
  const theme = useTheme();
  const mistake = dashboard.recentMistakes[0];
  const weakness = dashboard.recurringWeaknesses[0];
  const vocabulary = dashboard.learnedVocabulary[0];
  const insights = [
    mistake ? { icon: 'create-outline' as const, label: 'Recent correction', detail: `${mistake.original} → ${mistake.corrected}` } : undefined,
    weakness ? { icon: 'repeat-outline' as const, label: 'Recurring focus', detail: `${weakness.key} · seen ${weakness.mistakes} times` } : undefined,
    vocabulary ? { icon: 'bookmark-outline' as const, label: 'Word discovered', detail: `${vocabulary.word}（${vocabulary.reading}） · ${vocabulary.meaning}` } : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <View style={styles.section}>
      <SectionHeading title="Recent learning insights" detail={dashboard.sessionCount ? `${dashboard.sessionCount} conversations imported` : undefined} />
      {!insights.length ? (
        <EmptyState
          title="Your conversation notes will appear here"
          message="Choose your practice log and sync after a ChatGPT practice session."
          symbol="話"
        />
      ) : (
        <View style={styles.timeline}>
          {insights.map((insight, index) => <InsightRow key={insight.label} {...insight} last={index === insights.length - 1} />)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review learning insights from your conversations"
            onPress={onOpenReview}
            style={({ pressed }) => [styles.reviewLink, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>Review from your conversations</ThemedText>
            <Ionicons name="arrow-forward" size={18} color={theme.primary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  timeline: { minWidth: 0 },
  timelineRow: { flexDirection: 'row', minWidth: 0 },
  timelineMarker: { alignItems: 'center', width: 28 },
  dot: { borderRadius: Radius.pill, height: 9, marginTop: 8, width: 9 },
  line: { flex: 1, marginVertical: Spacing.one, width: 1 },
  insightCopy: { flex: 1, gap: Spacing.two, minWidth: 0, paddingBottom: Spacing.three, paddingLeft: Spacing.two, paddingTop: Spacing.one },
  insightLabel: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minWidth: 0 },
  reviewLink: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two, minHeight: 52, paddingHorizontal: Spacing.two },
});
