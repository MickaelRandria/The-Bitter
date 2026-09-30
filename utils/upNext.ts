import { TvProgress, TvWatchState } from '../types';

/**
 * Où reprendre une série.
 *
 * La progression se déclare de trois façons, que la personne mélange librement :
 * des épisodes cochés un à un, des saisons cochées en bloc, et le marque-page
 * « Reprendre : saison 2, épisode 4 » posé à la main. Le prochain épisode se
 * déduit du point **le plus avancé** des trois. Pas du plus récent : cocher
 * après coup un épisode oublié de la saison 1 ne doit pas renvoyer quelqu'un en
 * arrière.
 *
 * La saison 0 (épisodes spéciaux, bonus) n'entre jamais dans le calcul : TMDB
 * la liste comme une saison, mais personne ne la regarde « avant » la saison 1.
 */

export interface SeasonShape {
  seasonNumber: number;
  episodeCount: number;
}

/** Une place dans la série. `episode: 0` veut dire « rien vu de cette saison ». */
export interface EpisodePosition {
  season: number;
  episode: number;
}

/** Les séries dont on attend la suite. Ni « à voir » (pas commencée), ni « abandonnée ». */
export const FOLLOWED_STATES: TvWatchState[] = ['watching', 'paused', 'completed'];

const isAfter = (a: EpisodePosition, b: EpisodePosition) =>
  a.season > b.season || (a.season === b.season && a.episode > b.episode);

/** Le point le plus avancé, ou `null` si rien n'a encore été déclaré. */
export function furthestPosition(
  progress: TvProgress | undefined,
  seasons: SeasonShape[] = []
): EpisodePosition | null {
  if (!progress) return null;
  const candidates: EpisodePosition[] = [];

  for (const entry of Object.values(progress.episodes ?? {})) {
    if (entry.watched && entry.seasonNumber > 0) {
      candidates.push({ season: entry.seasonNumber, episode: entry.episodeNumber });
    }
  }

  for (const season of progress.seasonsWatched ?? []) {
    if (season <= 0) continue;
    // Saison cochée en bloc : vue jusqu'à son dernier épisode. Sans le compte
    // d'épisodes, « très loin » suffit — la saison suivante reste la bonne suite.
    const count = seasons.find((s) => s.seasonNumber === season)?.episodeCount;
    candidates.push({ season, episode: count ?? Number.MAX_SAFE_INTEGER });
  }

  // Le marque-page désigne l'épisode à reprendre : ce qui précède est vu.
  if (progress.lastSeason != null && progress.lastSeason > 0) {
    candidates.push({
      season: progress.lastSeason,
      episode: Math.max(0, (progress.lastEpisode ?? 1) - 1),
    });
  }

  return candidates.reduce<EpisodePosition | null>(
    (best, c) => (!best || isAfter(c, best) ? c : best),
    null
  );
}

/**
 * L'épisode qui suit le point le plus avancé, ou `null` si la personne est à
 * jour de tout ce que TMDB connaît. Série jamais commencée : saison 1, épisode 1.
 *
 * TMDB compte dans une saison les épisodes annoncés mais pas encore diffusés :
 * l'épisode rendu peut donc être à venir. C'est à l'appelant de lire sa date.
 */
export function nextEpisode(
  progress: TvProgress | undefined,
  seasons: SeasonShape[]
): EpisodePosition | null {
  const regular = seasons
    .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  if (regular.length === 0) return null;

  const from = furthestPosition(progress, regular);
  if (!from) return { season: regular[0].seasonNumber, episode: 1 };

  const current = regular.find((s) => s.seasonNumber === from.season);
  if (current && from.episode < current.episodeCount) {
    return { season: from.season, episode: from.episode + 1 };
  }
  const following = regular.find((s) => s.seasonNumber > from.season);
  return following ? { season: following.seasonNumber, episode: 1 } : null;
}

/**
 * Ce qui reste à voir dans la saison, à partir de l'épisode donné inclus, parmi
 * les épisodes déjà diffusés. La durée totale est en minutes ; elle est nulle
 * quand TMDB ne connaît la durée d'aucun épisode.
 */
export function remainingInSeason(
  episodes: { episodeNumber: number; airDate?: string; runtime?: number }[],
  from: number,
  today: string
): { count: number; minutes: number } {
  const left = episodes.filter(
    (e) => e.episodeNumber >= from && e.airDate != null && e.airDate <= today
  );
  return {
    count: left.length,
    minutes: left.reduce((sum, e) => sum + (e.runtime ?? 0), 0),
  };
}

/** « 4 h 20 », « 45 min ». Arrondi aux cinq minutes : une estimation, pas un chronomètre. */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}
