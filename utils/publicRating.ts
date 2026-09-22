import { Movie } from '../types';
import { ImdbLookup, ImdbRating, imdbKey } from '../services/imdb';

/**
 * La note du public : IMDb d'abord, TMDB à défaut.
 *
 * Tous les affichages et toutes les statistiques qui comparent l'utilisateur au
 * public passent par ici, pour qu'un film ne soit jamais noté IMDb sur sa carte
 * et TMDB dans les statistiques. La source voyage avec la valeur : un libellé
 * « IMDb » sur une note TMDB serait faux.
 */

export type RatingSource = 'imdb' | 'tmdb';

export interface PublicRating {
  value: number;
  source: RatingSource;
  /** Nombre de votes IMDb, quand on le connaît. */
  votes?: number;
}

const valid = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const pickPublicRating = (
  imdb: number | null | undefined,
  tmdb: number | null | undefined,
  votes?: number | null
): PublicRating | null => {
  if (valid(imdb)) return { value: Math.round(imdb * 10) / 10, source: 'imdb', votes: votes ?? undefined };
  if (valid(tmdb)) return { value: Math.round(tmdb * 10) / 10, source: 'tmdb' };
  return null;
};

export const getPublicRating = (movie: Pick<Movie, 'imdbRating' | 'imdbVotes' | 'tmdbRating'>): PublicRating | null =>
  pickPublicRating(movie.imdbRating, movie.tmdbRating, movie.imdbVotes);

/** Note du public d'un résultat TMDB brut (liste, fiche), avec la note IMDb si on l'a. */
export const pickFromLookup = (
  ratings: Map<string, ImdbRating>,
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  tmdbRating: number | null | undefined
): PublicRating | null => {
  const imdb = ratings.get(imdbKey(mediaType, tmdbId));
  return pickPublicRating(imdb?.rating, tmdbRating, imdb?.votes);
};

export const ratingSourceLabel = (source: RatingSource) => (source === 'imdb' ? 'IMDb' : 'TMDB');

/** Libellé d'une moyenne : « IMDb », « TMDB », ou les deux quand elle les mélange. */
export const aggregateSourceLabel = (ratings: PublicRating[]) => {
  const sources = new Set(ratings.map((rating) => rating.source));
  if (sources.size === 0 || (sources.size === 1 && sources.has('imdb'))) return 'IMDb';
  if (sources.size === 1) return 'TMDB';
  return 'IMDb/TMDB';
};

/** « 1,2 M », « 845 k » : le nombre de votes tient dans un badge. */
export const formatVotes = (votes: number, locale = 'fr') =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(votes);

/**
 * Ce qu'il faut demander au cache IMDb pour une œuvre de la collection.
 *
 * Les saisons en sont exclues : IMDb ne note pas une saison, et reprendre la
 * note de la série laisserait croire le contraire. Elles gardent TMDB.
 */
export const imdbLookupFor = (
  movie: Pick<Movie, 'tmdbId' | 'mediaType' | 'seasonNumber'>
): ImdbLookup | null => {
  if (movie.tmdbId == null || movie.seasonNumber != null) return null;
  return { mediaType: movie.mediaType === 'tv' ? 'tv' : 'movie', tmdbId: movie.tmdbId };
};
