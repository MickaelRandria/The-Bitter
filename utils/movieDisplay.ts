import { Movie, RatingCriteria } from '../types';

export type MovieDisplayMode = 'latest' | 'average';

export function getMovieDisplayMode(movie: Movie): MovieDisplayMode {
  return movie.preferred_display_mode ?? 'average';
}

function rawAvg(movie: Movie): number {
  return (
    (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4
  );
}

export function getLatestRating(movie: Movie): number {
  if (!movie.watches || movie.watches.length <= 1) return rawAvg(movie);
  return movie.current_rating ?? rawAvg(movie);
}

export function getAverageRating(movie: Movie): number {
  if (!movie.watches || movie.watches.length <= 1) return rawAvg(movie);
  return movie.avg_rating ?? rawAvg(movie);
}

export function getMovieDisplayRating(movie: Movie): number {
  const mode = getMovieDisplayMode(movie);
  return mode === 'latest' ? getLatestRating(movie) : getAverageRating(movie);
}

export function getDisplayRatings(movie: Movie): RatingCriteria {
  const mode = getMovieDisplayMode(movie);
  if (mode === 'latest' || !movie.watches || movie.watches.length <= 1) {
    return movie.ratings;
  }
  const total = movie.watches.reduce(
    (acc, w) => ({
      story: acc.story + w.ratings.story,
      visuals: acc.visuals + w.ratings.visuals,
      acting: acc.acting + w.ratings.acting,
      sound: acc.sound + w.ratings.sound,
    }),
    { story: 0, visuals: 0, acting: 0, sound: 0 }
  );
  const n = movie.watches.length;
  return {
    story: Math.round((total.story / n) * 10) / 10,
    visuals: Math.round((total.visuals / n) * 10) / 10,
    acting: Math.round((total.acting / n) * 10) / 10,
    sound: Math.round((total.sound / n) * 10) / 10,
  };
}
