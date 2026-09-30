import { TvProgress } from '../types';
import { getSeriesDetails, TmdbSeasonSummary } from './tmdb';
import { getSeasonEpisodes, getSeasonOverview } from './tv';
import { EpisodePosition, furthestPosition } from '../utils/upNext';
import { getSeriesRecap } from './ai';

/**
 * « Précédemment dans… » : ce qu'il faut se rappeler pour reprendre une série.
 *
 * SANS SPOILER PAR CONSTRUCTION
 * Le récap n'est écrit qu'à partir des résumés TMDB des épisodes **déjà vus** —
 * et des saisons entières déjà vues. Rien de ce qui suit le dernier épisode vu
 * n'est envoyé au modèle : il ne peut pas révéler ce qu'il ne lit pas. La
 * consigne côté serveur lui interdit en plus d'ajouter ce qu'il saurait de la
 * série par ailleurs.
 */

export interface RecapPart {
  label: string;
  text: string;
}

export interface RecapSource {
  lastSeen: EpisodePosition;
  premise: string;
  /** Les saisons précédentes, de la plus ancienne à la plus récente. */
  seasons: RecapPart[];
  /** Les épisodes vus de la saison en cours, dans l'ordre. */
  episodes: RecapPart[];
}

export interface SeriesRecapResult {
  source: RecapSource;
  /** Le récap rédigé, ou `null` : on montre alors les résumés tels quels. */
  recap: string | null;
  /** Pourquoi il n'y a pas de récap rédigé, quand c'est une erreur à dire. */
  error?: string;
}

const PART_LIMIT = 700;
const PREVIOUS_SEASONS = 3;
const RECENT_EPISODES = 10;

const trim = (text: string) =>
  text.length > PART_LIMIT ? `${text.slice(0, PART_LIMIT - 1)}…` : text;

/** Le dernier épisode réellement vu, ou `null` si la série n'a pas commencé. */
function lastSeen(
  progress: TvProgress | undefined,
  seasons: TmdbSeasonSummary[]
): EpisodePosition | null {
  const regular = seasons
    .filter((s) => s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const furthest = furthestPosition(progress, regular);
  if (!furthest) return null;
  if (furthest.episode >= 1) {
    const count = regular.find((s) => s.seasonNumber === furthest.season)?.episodeCount;
    return {
      season: furthest.season,
      episode: count ? Math.min(furthest.episode, count) : furthest.episode,
    };
  }
  // « Reprendre à l'épisode 1 » : la saison d'avant est vue en entier.
  const previous = regular.filter((s) => s.seasonNumber < furthest.season).pop();
  return previous ? { season: previous.seasonNumber, episode: previous.episodeCount } : null;
}

export async function buildRecapSource(
  tmdbId: number,
  progress: TvProgress | undefined,
  seasons: TmdbSeasonSummary[],
  language = 'fr-FR'
): Promise<RecapSource | null> {
  const seen = lastSeen(progress, seasons);
  if (!seen) return null;

  const previousNumbers = seasons
    .map((s) => s.seasonNumber)
    .filter((n) => n > 0 && n < seen.season)
    .sort((a, b) => a - b)
    .slice(-PREVIOUS_SEASONS);

  const [details, episodes, overviews] = await Promise.all([
    getSeriesDetails(tmdbId),
    getSeasonEpisodes(tmdbId, seen.season, language).catch(() => []),
    Promise.all(previousNumbers.map((n) => getSeasonOverview(tmdbId, n, language).catch(() => ''))),
  ]);

  const source: RecapSource = {
    lastSeen: seen,
    premise: trim(details?.synopsis ?? ''),
    seasons: previousNumbers
      .map((n, i) => ({ label: `Saison ${n}`, text: trim(overviews[i]) }))
      .filter((part) => part.text),
    episodes: episodes
      .filter((e) => e.episodeNumber <= seen.episode && e.overview)
      .slice(-RECENT_EPISODES)
      .map((e) => ({ label: `S${seen.season} · É${e.episodeNumber}`, text: trim(e.overview!) })),
  };
  return source.seasons.length || source.episodes.length ? source : null;
}

/** Le texte remis au modèle. Il ne contient que ce qui a été vu. */
export function recapContext(title: string, source: RecapSource): string {
  const lines = [`SÉRIE : ${title}`];
  if (source.premise) lines.push(`PRÉMISSE : ${source.premise}`);
  if (source.seasons.length) {
    lines.push('', 'SAISONS DÉJÀ VUES :', ...source.seasons.map((p) => `— ${p.label} : ${p.text}`));
  }
  if (source.episodes.length) {
    lines.push(
      '',
      `ÉPISODES VUS DE LA SAISON ${source.lastSeen.season} :`,
      ...source.episodes.map((p) => `— ${p.label} : ${p.text}`)
    );
  }
  lines.push(
    '',
    `DERNIER ÉPISODE VU : saison ${source.lastSeen.season}, épisode ${source.lastSeen.episode}. Rien de ce qui suit ne doit apparaître.`
  );
  return lines.join('\n');
}

/** Un récap par série et par position : rouvrir la fiche ne dépense pas une seconde question. */
const cache = new Map<string, SeriesRecapResult>();

export async function getRecap(
  series: { tmdbId: number; title: string; progress: TvProgress | undefined },
  seasons: TmdbSeasonSummary[],
  language = 'fr-FR'
): Promise<SeriesRecapResult | null> {
  const source = await buildRecapSource(series.tmdbId, series.progress, seasons, language);
  if (!source) return null;
  const key = `${series.tmdbId}:${source.lastSeen.season}:${source.lastSeen.episode}:${language}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let result: SeriesRecapResult;
  try {
    result = { source, recap: await getSeriesRecap(recapContext(series.title, source)) };
  } catch (error) {
    result = { source, recap: null, error: error instanceof Error ? error.message : undefined };
  }
  // Une erreur passagère ne se met pas en cache : on retentera à la prochaine ouverture.
  if (result.recap) cache.set(key, result);
  return result;
}
