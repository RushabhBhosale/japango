import { useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/common/empty-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { EpisodePlayer } from '@/components/lesson-v3/episode-player';
import { v3Episodes } from '@/features/lesson-v3/episode-one';

export default function EpisodeScreen() {
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const episode = episodeId ? v3Episodes[episodeId] : undefined;
  if (!episode) return <ScreenContainer><EmptyState title="Episode unavailable" message="This story has not been released yet." /></ScreenContainer>;
  return <EpisodePlayer episode={episode} />;
}
