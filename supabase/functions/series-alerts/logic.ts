/**
 * Ce qu'une fiche série TMDB annonce pour aujourd'hui. Module pur, sans import :
 * testé dans tests/seriesAlerts.test.mjs.
 *
 * LES DATES SONT CELLES DE LA DIFFUSION D'ORIGINE
 * TMDB donne la date de la première diffusion, souvent américaine. Pour une
 * série Netflix, c'est la même partout ; pour une série de chaîne américaine,
 * l'épisode arrive en France le jour même ou le lendemain selon la plateforme.
 * Les textes disent donc « diffusé », jamais « disponible sur ».
 */

export interface TmdbEpisodeRef {
  air_date?: string | null;
  season_number: number;
  episode_number: number;
}

export interface TmdbSeries {
  id: number;
  status?: string;
  next_episode_to_air?: TmdbEpisodeRef | null;
  last_episode_to_air?: TmdbEpisodeRef | null;
  seasons?: { season_number: number; air_date?: string | null }[];
}

export type SeriesAlertKind = 'tv_episode' | 'tv_season' | 'tv_season_soon';

export interface SeriesAlert {
  kind: SeriesAlertKind;
  season: number;
  episode: number;
  airDate: string;
}

/** L'annonce d'une nouvelle saison part trois jours avant : de quoi s'organiser, pas de quoi oublier. */
export const SOON_DAYS = 3;

export const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Aujourd'hui à Paris, « aaaa-mm-jj » : le serveur tourne en UTC. */
export const parisToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * Les alertes du jour pour une série.
 *
 * Une saison mise en ligne d'un bloc (Netflix) a tous ses épisodes datés du
 * même jour : TMDB range alors le dernier dans `last_episode_to_air`. C'est la
 * date de la saison, pas le numéro de l'épisode, qui dit qu'une saison commence.
 */
export function seriesAlerts(series: TmdbSeries, today: string): SeriesAlert[] {
  const alerts: SeriesAlert[] = [];
  const regular = (series.seasons ?? []).filter((s) => s.season_number > 0);

  const premiere = regular.find((s) => s.air_date === today);
  const airing = [series.next_episode_to_air, series.last_episode_to_air].find(
    (e): e is TmdbEpisodeRef => !!e && e.air_date === today && e.season_number > 0
  );
  if (premiere) {
    alerts.push({ kind: 'tv_season', season: premiere.season_number, episode: 1, airDate: today });
  } else if (airing) {
    alerts.push({
      kind: airing.episode_number === 1 ? 'tv_season' : 'tv_episode',
      season: airing.season_number,
      episode: airing.episode_number,
      airDate: today,
    });
  }

  const soon = addDays(today, SOON_DAYS);
  const next = series.next_episode_to_air;
  const soonSeason =
    regular.find((s) => s.air_date === soon)?.season_number ??
    (next && next.air_date === soon && next.episode_number === 1 && next.season_number > 0
      ? next.season_number
      : undefined);
  if (soonSeason != null) {
    alerts.push({ kind: 'tv_season_soon', season: soonSeason, episode: 1, airDate: soon });
  }

  return alerts;
}
