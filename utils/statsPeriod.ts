import type { Movie } from '../types';

/**
 * La période des statistiques : une année, ou depuis toujours. Une année ne se
 * propose qu'à partir de quelques films vus : en dessous, ses stats seraient
 * vides. Le choix reste sur le téléphone.
 */
export type StatsPeriod = 'all' | number;

/** Films vus pour qu'une année soit proposée. */
export const PERIOD_MIN_FILMS = 5;
const KEY = 'bitter_stats_period';

export const yearOf = (m: Movie) => new Date(m.dateWatched || m.dateAdded).getFullYear();

/** Les années qui ont assez de films vus, de la plus récente à la plus ancienne. */
export function periodYears(movies: Movie[]): number[] {
  const counts = new Map<number, number>();
  for (const m of movies) {
    if (m.status !== 'watched') continue;
    const y = yearOf(m);
    if (Number.isFinite(y)) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= PERIOD_MIN_FILMS).map(([y]) => y).sort((a, b) => b - a);
}

/** Les films de la période ; tous les films depuis toujours. */
export const periodMovies = (movies: Movie[], period: StatsPeriod): Movie[] =>
  period === 'all' ? movies : movies.filter((m) => yearOf(m) === period);

export function readPeriod(): StatsPeriod {
  try {
    const saved = localStorage.getItem(KEY);
    return saved && /^\d{4}$/.test(saved) ? Number(saved) : 'all';
  } catch {
    return 'all';
  }
}

export function savePeriod(period: StatsPeriod) {
  try {
    localStorage.setItem(KEY, String(period));
  } catch {
    // Sans stockage, le choix vaut pour cette visite.
  }
}
