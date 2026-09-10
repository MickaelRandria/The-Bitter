import { TvEpisodeEntry, TvProgress } from '../types';

export const episodeKey = (season: number, episode: number) => `${season}:${episode}`;

export function updateEpisode(progress: TvProgress | undefined, entry: TvEpisodeEntry): TvProgress {
  return {
    ...progress,
    state: entry.watched && (!progress || progress.state === 'planned') ? 'watching' : progress?.state ?? 'planned',
    // Un épisode explicitement décoché l'emporte sur la saison cochée en bloc.
    seasonsWatched: entry.watched ? progress?.seasonsWatched : progress?.seasonsWatched?.filter(n => n !== entry.seasonNumber),
    episodes: { ...progress?.episodes, [episodeKey(entry.seasonNumber, entry.episodeNumber)]: entry },
    updatedAt: entry.updatedAt,
  };
}

export function episodeAverage(entries: TvEpisodeEntry[], season: number) {
  const rated = entries.filter(e => e.seasonNumber === season && e.rating != null && Number.isFinite(e.rating));
  return rated.length ? { count: rated.length, average: rated.reduce((sum, e) => sum + e.rating!, 0) / rated.length } : null;
}

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
