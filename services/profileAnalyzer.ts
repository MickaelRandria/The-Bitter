import { Movie } from '../types';

export const analyzeGenres = (movies: Movie[]) => {
  const watched = movies.filter((m) => m.status === 'watched');
  const stats: Record<string, { sum: number; count: number }> = {};

  watched.forEach((m) => {
    if (!m.genre) return;
    if (!stats[m.genre]) stats[m.genre] = { sum: 0, count: 0 };
    const avg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
    stats[m.genre].sum += avg;
    stats[m.genre].count++;
  });

  return Object.entries(stats)
    .map(([name, s]) => ({ name, avgRating: s.sum / s.count, count: s.count }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
};

export const analyzeDirectors = (movies: Movie[]) => {
  const watched = movies.filter((m) => m.status === 'watched');
  const stats: Record<string, { sum: number; count: number }> = {};

  watched.forEach((m) => {
    if (!m.director) return;
    if (!stats[m.director]) stats[m.director] = { sum: 0, count: 0 };
    const avg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
    stats[m.director].sum += avg;
    stats[m.director].count++;
  });

  return Object.entries(stats)
    .map(([name, s]) => ({ name, avgRating: s.sum / s.count, count: s.count }))
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.avgRating - a.avgRating);
};

export const analyzeDecades = (movies: Movie[]) => {
  const watched = movies.filter((m) => m.status === 'watched' && m.year);
  const stats: Record<number, { sum: number; count: number }> = {};

  watched.forEach((m) => {
    const decade = Math.floor(m.year / 10) * 10;
    if (!stats[decade]) stats[decade] = { sum: 0, count: 0 };
    const avg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
    stats[decade].sum += avg;
    stats[decade].count++;
  });

  return Object.entries(stats)
    .map(([decade, s]) => ({ decade: parseInt(decade), avgRating: s.sum / s.count, count: s.count }))
    .sort((a, b) => b.avgRating - a.avgRating);
};

export const analyzeUserProfile = (movies: Movie[]) => ({
  favoriteGenres: analyzeGenres(movies).slice(0, 3),
  favoriteDirectors: analyzeDirectors(movies).slice(0, 3),
  favoriteDecades: analyzeDecades(movies).slice(0, 2),
});

export type UserProfileAnalysis = ReturnType<typeof analyzeUserProfile>;
