import type { CinemaScreening, Movie } from '../types';
import { uniqueCollection } from './collectionRules';

export function screeningMovie(screening: CinemaScreening, movies: Movie[]): Movie | undefined {
  const candidates = uniqueCollection(movies).filter(movie => (movie.mediaType ?? 'movie') === 'movie' && movie.seasonNumber == null);
  if (screening.tmdbId != null) return candidates.find(movie => movie.tmdbId === screening.tmdbId);
  const matches = candidates.filter(movie => movie.title.trim().toLocaleLowerCase() === screening.title.trim().toLocaleLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

export function screeningRatingDue(screenings: CinemaScreening[], movies: Movie[], now = Date.now()): CinemaScreening[] {
  return screenings.filter(screening => {
    if (!['scheduled', 'completed'].includes(screening.status) || !Number.isFinite(screening.startsAt)) return false;
    if (Number.isFinite(screening.ratingConfirmedAt)) return false;
    const movie = screeningMovie(screening, movies);
    const duration = movie?.runtime && movie.runtime > 0 ? movie.runtime : 120;
    if (screening.startsAt + (duration + 15) * 60_000 > now || now - screening.startsAt > 30 * 86_400_000) return false;
    // Une date de note ne dit pas quelle séance elle concerne : demander le lien.
    return true;
  }).sort((a, b) => b.startsAt - a.startsAt);
}
