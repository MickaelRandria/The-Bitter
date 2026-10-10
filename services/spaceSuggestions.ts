/**
 * « Et maintenant ? » : trois films à proposer au groupe après un verdict, chacun
 * pour une raison différente.
 *
 * - la grosse sortie du moment, en salle ;
 * - un film qui marie le genre préféré de chacun ;
 * - un film tiré du coup de cœur commun du groupe.
 *
 * Tout vient de TMDB, avec le cache des listes de sorties déjà partagé par
 * l'accueil. Les films déjà dans l'espace sont écartés.
 */
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { getCachedData, setCachedData } from '../utils/cache';
import { TMDB_GENRE_IDS } from '../utils/verdict';
import { addMovieToSpace, SharedMovie } from './supabase';
import { getMovieDetailsForAdd, getRecommendations, getSharedMovieDetails, getTheatreReleases } from './tmdb';

export type SuggestionKind = 'release' | 'each' | 'common';

export interface SpaceSuggestion {
  kind: SuggestionKind;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year?: number;
  /** Données de la raison, mises en mots par l'écran. */
  releaseDate?: string;
  genres?: { name: string; genre: string }[];
  from?: string;
}

interface TmdbRow {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  vote_average?: number;
  popularity?: number;
}

const yearOf = (date?: string) => (date ? Number(date.slice(0, 4)) || undefined : undefined);

/** Films qui croisent des genres : tous à la fois d'abord, l'un ou l'autre sinon. */
const discoverByGenres = async (genres: string[]): Promise<TmdbRow[]> => {
  const ids = [...new Set(genres.map((g) => TMDB_GENRE_IDS[g]).filter(Boolean))];
  if (!ids.length) return [];
  const key = `spaceSuggest:${ids.join(',')}`;
  const cached = getCachedData<TmdbRow[]>(key);
  if (cached) return cached;
  const fetchWith = async (joined: string) => {
    try {
      const res = await fetch(
        `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&with_genres=${joined}` +
          `&vote_average.gte=7&vote_count.gte=300&sort_by=popularity.desc&page=1`
      );
      const data = await res.json();
      return ((data.results ?? []) as TmdbRow[]).filter((m) => m.poster_path);
    } catch {
      return [];
    }
  };
  let results = await fetchWith(ids.join(','));
  if (results.length < 3) results = [...results, ...(await fetchWith(ids.join('|')))];
  setCachedData(key, results);
  return results;
};

export async function getSpaceSuggestions(input: {
  /** Films déjà dans l'espace, vus ou à voir. */
  existing: Set<number>;
  /** Le genre préféré de chaque membre, dans cet espace. */
  tastes: { name: string; genre: string }[];
  /** Le film que tout le groupe a le mieux noté. */
  common: { tmdbId: number; title: string } | null;
}): Promise<SpaceSuggestion[]> {
  const taken = new Set(input.existing);
  const pick = (rows: TmdbRow[]) => {
    const row = rows.find((r) => r.poster_path && !taken.has(r.id));
    if (row) taken.add(row.id);
    return row ?? null;
  };

  const [releases, byGenres, recos] = await Promise.all([
    getTheatreReleases('FR').catch(() => ({ thisWeek: [], upcoming: [] })),
    input.tastes.length ? discoverByGenres(input.tastes.map((t) => t.genre)) : Promise.resolve([]),
    input.common ? getRecommendations(input.common.tmdbId) : Promise.resolve([]),
  ]);

  const out: SpaceSuggestion[] = [];
  const release = pick(
    [...releases.thisWeek]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .map((r) => ({ id: r.id, title: r.title, poster_path: r.posterPath, release_date: r.releaseDate }))
  );
  if (release) {
    out.push({ kind: 'release', tmdbId: release.id, title: release.title, posterPath: release.poster_path, year: yearOf(release.release_date), releaseDate: release.release_date });
  }
  const each = pick(byGenres);
  if (each) {
    out.push({ kind: 'each', tmdbId: each.id, title: each.title, posterPath: each.poster_path, year: yearOf(each.release_date), genres: input.tastes });
  }
  const common = pick(recos as TmdbRow[]);
  if (common && input.common) {
    out.push({ kind: 'common', tmdbId: common.id, title: common.title, posterPath: common.poster_path, year: yearOf(common.release_date), from: input.common.title });
  }
  return out;
}

/** « Proposer » : le film entre dans « À voir ensemble », comme depuis le formulaire d'ajout. */
export async function proposeSuggestion(
  spaceId: string,
  userId: string,
  suggestion: { tmdbId: number }
): Promise<{ movie: SharedMovie | null; error?: string }> {
  const [details, extra] = await Promise.all([getMovieDetailsForAdd(suggestion.tmdbId), getSharedMovieDetails(suggestion.tmdbId)]);
  if (!details) return { movie: null, error: 'Film introuvable sur TMDB.' };
  return addMovieToSpace(
    spaceId,
    {
      tmdb_id: details.tmdbId,
      title: details.title,
      director: details.director,
      year: details.year,
      genre: details.genre,
      poster_url: details.posterUrl || undefined,
      status: 'watchlist',
      media_type: 'movie',
      ...extra,
    },
    userId
  );
}

export const posterOf = (path: string | null | undefined, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined);
