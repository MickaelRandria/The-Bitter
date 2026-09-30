import { TvEpisodeEntry, TvProgress } from '../types';
import { EpisodePosition, SeasonShape, nextEpisode } from './upNext';
import { episodeKey, localDate, updateEpisode } from './tvProgress';

/**
 * Coche un épisode comme vu et fait suivre le marque-page.
 *
 * C'est le geste de « À suivre » comme celui du mode épisode. Une note rapide ou
 * une grille complète arrivent par `extra`. Une note déjà posée sur cet
 * épisode, ou un commentaire, sont gardés : revoir un épisode ne les efface pas.
 */
export function markEpisodeWatched(
  progress: TvProgress | undefined,
  position: EpisodePosition,
  seasons: SeasonShape[],
  options: {
    /** Terminée ou annulée selon TMDB : plus rien ne viendra après le dernier épisode. */
    ended: boolean;
    runtime?: number;
    extra?: Partial<TvEpisodeEntry>;
    now?: number;
  }
): TvProgress {
  const now = options.now ?? Date.now();
  const previous = progress?.episodes?.[episodeKey(position.season, position.episode)];
  const entry: TvEpisodeEntry = {
    ...previous,
    ...options.extra,
    seasonNumber: position.season,
    episodeNumber: position.episode,
    watched: true,
    watchedAt: options.extra?.watchedAt ?? localDate(new Date(now)),
    runtime: options.runtime ?? previous?.runtime,
    updatedAt: now,
  };
  const marked = updateEpisode(progress, entry);
  const after = nextEpisode(marked, seasons);
  return {
    ...marked,
    // Une série « terminée » dont une saison sort, ou mise en pause puis reprise, est de nouveau en cours.
    state: after == null && options.ended ? 'completed' : 'watching',
    // Le marque-page suit, sinon la fiche afficherait une place dépassée.
    lastSeason: after?.season ?? position.season,
    lastEpisode: after?.episode ?? position.episode + 1,
  };
}

/**
 * « J'ai vu jusqu'à la saison 2, épisode 5 » : la progression qui en découle.
 *
 * Le marque-page désigne l'épisode à reprendre. Après le dernier épisode d'une
 * saison, c'est donc le premier de la suivante. `null` veut dire « pas encore
 * commencée » : la série entre dans le suivi à la saison 1, épisode 1.
 */
export function progressFromLastSeen(
  progress: TvProgress | undefined,
  lastSeen: EpisodePosition | null,
  seasons: SeasonShape[],
  options: { ended: boolean; now?: number }
): TvProgress {
  const now = options.now ?? Date.now();
  if (!lastSeen) return { ...progress, state: 'watching', updatedAt: now };

  const regular = seasons
    .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const season = regular.find((s) => s.seasonNumber === lastSeen.season);
  const following = regular.find((s) => s.seasonNumber > lastSeen.season);
  const bookmark =
    season && lastSeen.episode >= season.episodeCount && following
      ? { lastSeason: following.seasonNumber, lastEpisode: 1 }
      : { lastSeason: lastSeen.season, lastEpisode: lastSeen.episode + 1 };

  const updated: TvProgress = { ...progress, ...bookmark, state: 'watching', updatedAt: now };
  return {
    ...updated,
    state: nextEpisode(updated, seasons) == null && options.ended ? 'completed' : 'watching',
  };
}
