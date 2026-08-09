import { episodeOne } from './episode-one';
import { createAuthoredEpisodeSeries } from './authored-episode-factory';
import { n4EpisodeDefinitions } from './episode-definitions-n4';
import { n5EpisodeDefinitions } from './episode-definitions-n5';

const authoredEpisodes = createAuthoredEpisodeSeries([
  ...n5EpisodeDefinitions,
  ...n4EpisodeDefinitions,
]);

export const v3EpisodeList = [episodeOne, ...authoredEpisodes];

export const v3Episodes: Record<string, (typeof v3EpisodeList)[number]> = Object.fromEntries(
  v3EpisodeList.map((episode) => [episode.id, episode]),
);
