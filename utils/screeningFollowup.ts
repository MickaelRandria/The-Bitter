import type { CinemaScreening, Movie } from '../types';
import { uniqueCollection } from './collectionRules';
import { ratingOf } from './ratingHistory';
import { calendarDay } from './calendarAgenda';

export function screeningMovie(screening: CinemaScreening, movies: Movie[]): Movie | undefined {
  const candidates = uniqueCollection(movies).filter(movie => (movie.mediaType ?? 'movie') === 'movie' && movie.seasonNumber == null);
  if (screening.tmdbId != null) return candidates.find(movie => movie.tmdbId === screening.tmdbId);
  const matches = candidates.filter(movie => movie.title.trim().toLocaleLowerCase() === screening.title.trim().toLocaleLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

export function screeningRatingDue(screenings: CinemaScreening[], movies: Movie[], now = Date.now()): CinemaScreening[] {
  return screenings.filter(screening => {
    if (!['scheduled', 'completed'].includes(screening.status) || !Number.isFinite(screening.startsAt)) return false;
    const movie = screeningMovie(screening, movies);
    const duration = movie?.runtime && movie.runtime > 0 ? movie.runtime : 120;
    if (screening.startsAt + (duration + 15) * 60_000 > now || now - screening.startsAt > 30 * 86_400_000) return false;
    // Une ancienne note ne répond pas à une nouvelle séance de rewatch.
    const day = calendarDay(screening.startsAt);
    if (movie?.dateWatched && ratingOf(movie) != null && calendarDay(movie.dateWatched) >= day) return false;
    if (movie?.watches?.some(watch => Number.isFinite(Date.parse(watch.watched_at)) && calendarDay(Date.parse(watch.watched_at)) >= day
      && (watch.adaptiveRating != null || Object.values(watch.ratings || {}).some(value => value > 0)))) return false;
    return true;
  }).sort((a, b) => b.startsAt - a.startsAt);
}
