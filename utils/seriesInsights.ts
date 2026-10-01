import { EpisodeReaction, TvEpisodeEntry, TvProgress } from '../types';

/**
 * Ce que la progression raconte, au-delà de la place : le rythme, ce qui reste
 * avant une nouvelle saison, ce qui tient dans une soirée, les moments forts.
 *
 * Tout est calculé sur des dates « AAAA-MM-JJ », sans fuseau : Date.parse les
 * lit en UTC, les changements d'heure ne décalent donc aucun compte de jours.
 */

const DAY = 86_400_000;
/** Le rythme se lit sur les quatre dernières semaines. */
const PACE_WINDOW_DAYS = 28;
/** Au-delà, une date de fin n'est plus une prévision mais une supposition. */
const MAX_FORECAST_DAYS = 120;
/** Une nouvelle saison annoncée plus loin que ça n'appelle pas encore à rattraper. */
const CATCH_UP_HORIZON_DAYS = 60;

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const addDays = (date: string, count: number) =>
  new Date(Date.parse(date) + count * DAY).toISOString().slice(0, 10);

/**
 * Épisodes vus par jour, sur les quatre dernières semaines. `null` sans au
 * moins deux épisodes datés : un seul ne fait pas un rythme. La période compte
 * au moins trois jours, pour qu'une soirée de binge ne promette pas la fin de
 * la saison pour demain.
 */
export function watchPace(progress: TvProgress | undefined, today: string): number | null {
  const dates = Object.values(progress?.episodes ?? {})
    .filter((e) => e.watched && e.watchedAt && e.seasonNumber > 0)
    .map((e) => e.watchedAt as string)
    .filter((d) => {
      const ago = days(d, today);
      return ago >= 0 && ago < PACE_WINDOW_DAYS;
    })
    .sort();
  if (dates.length < 2) return null;
  const span = Math.max(3, days(dates[0], today) + 1);
  return dates.length / span;
}

/** Le jour où la saison serait finie à ce rythme, ou `null` si c'est trop loin pour le dire. */
export function finishDate(remaining: number, pace: number | null, today: string): string | null {
  if (!pace || pace <= 0 || remaining <= 0) return null;
  const needed = Math.ceil(remaining / pace);
  return needed > MAX_FORECAST_DAYS ? null : addDays(today, needed);
}

/**
 * La saison suivante est annoncée : combien de jours avant elle, et combien
 * d'épisodes déjà sortis restent à voir d'ici là.
 */
export function catchUp(
  seasons: { seasonNumber: number; airDate?: string }[],
  currentSeason: number,
  remaining: number,
  today: string
): { season: number; days: number; episodes: number } | null {
  if (remaining <= 0) return null;
  const following = seasons
    .filter((s) => s.seasonNumber > currentSeason)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)[0];
  if (!following?.airDate || following.airDate <= today) return null;
  const until = days(today, following.airDate);
  return until > CATCH_UP_HORIZON_DAYS
    ? null
    : { season: following.seasonNumber, days: until, episodes: remaining };
}

/**
 * Ce qui tient dans le temps dont on dispose ce soir, à partir de l'épisode à
 * voir et parmi les épisodes déjà sortis. Un épisode dont TMDB ignore la durée
 * compte pour `fallback` minutes.
 */
export function episodesThatFit(
  episodes: { episodeNumber: number; airDate?: string; runtime?: number }[],
  from: number,
  budget: number,
  today: string,
  fallback = 45
): { count: number; minutes: number } {
  let minutes = 0;
  let count = 0;
  const queue = episodes
    .filter((e) => e.episodeNumber >= from && e.airDate != null && e.airDate <= today)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  for (const episode of queue) {
    const runtime = episode.runtime ?? fallback;
    if (minutes + runtime > budget) break;
    minutes += runtime;
    count += 1;
  }
  return { count, minutes };
}

export const REACTIONS: EpisodeReaction[] = ['shock', 'fire', 'cry', 'laugh'];

export const REACTION_EMOJI: Record<EpisodeReaction, string> = {
  shock: '😱',
  fire: '🔥',
  cry: '😭',
  laugh: '😂',
};

/**
 * Les moments forts d'une saison : pour chaque réaction, l'épisode qui la
 * porte. S'il y en a plusieurs, celui qu'on a le mieux noté l'emporte, puis le
 * plus récent : c'est « ton épisode le plus 😱 de la saison ».
 */
export function seasonMoments(
  entries: TvEpisodeEntry[],
  season: number
): { reaction: EpisodeReaction; episode: number; rating?: number }[] {
  return REACTIONS.flatMap((reaction) => {
    const best = entries
      .filter((e) => e.seasonNumber === season && e.reactions?.includes(reaction))
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.episodeNumber - a.episodeNumber)[0];
    return best ? [{ reaction, episode: best.episodeNumber, rating: best.rating }] : [];
  });
}
