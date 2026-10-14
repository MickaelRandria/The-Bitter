import type { Movie } from '../types';
import { workKey } from './workKey';

export function isWatchedWork(movie: Movie): boolean {
  if (movie.mediaType === 'tv' && movie.seasonNumber == null && movie.tvProgress) return movie.tvProgress.state === 'completed';
  return (movie.status ?? 'watched') === 'watched';
}

/** Une œuvre dans une liste ; les anciennes copies restent conservées en stockage. */
export function uniqueCollection(movies: Movie[]): Movie[] {
  const rows = new Map<string, Movie>();
  for (const movie of movies) {
    const key = movie.tmdbId != null ? workKey(movie) : `local:${movie.id}`;
    const previous = rows.get(key);
    if (!previous || (isWatchedWork(movie) && !isWatchedWork(previous))) rows.set(key, movie);
  }
  return [...rows.values()];
}

export function findCollectionWork(movies: Movie[], identity: Pick<Movie, 'tmdbId' | 'mediaType' | 'seasonNumber'>): Movie | undefined {
  if (identity.tmdbId == null) return undefined;
  return uniqueCollection(movies).find(movie => workKey(movie) === workKey(identity));
}

export function watchedWorkKeys(movies: Movie[]): Set<string> {
  return new Set(movies.filter(movie => movie.tmdbId != null && movie.seasonNumber == null && isWatchedWork(movie))
    .map(movie => `${movie.mediaType ?? 'movie'}:${movie.tmdbId}`));
}

/** Une suppression explicite retire aussi les anciennes copies de cette œuvre. */
export function removeCollectionWork(movies: Movie[], target: Movie): Movie[] {
  return movies.filter(movie => target.tmdbId != null && movie.tmdbId != null
    ? workKey(movie) !== workKey(target) : movie.id !== target.id);
}
