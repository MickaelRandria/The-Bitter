import type { Movie } from '../types';
import { getMovieDisplayRating } from './movieDisplay';

/**
 * Le mur des films vus : un film en grand, puis la mosaïque en sections.
 *
 * Chaque filtre change le regroupement ET le film en grand :
 * - récents : par mois de séance ; en grand, le film du mois (voir `WallPin`) ;
 * - mieux notés : par tranche de note ; en grand, le meilleur depuis toujours ;
 * - genre / année : un genre ou une année choisie ; en grand, son meilleur film.
 * Le film en grand ne revient pas dans la mosaïque.
 */

export type WallFilter = 'recent' | 'top' | 'genre' | 'year';
/** month : meilleure note du mois ; last : dernière séance ; ever : meilleure note depuis toujours ; pick : choisi. */
export type PinMode = 'month' | 'last' | 'ever' | 'pick';

export interface WallPin {
  mode: PinMode;
  movieId?: string;
  /** « Ton mot sur l'affiche », facultatif. */
  note?: string;
  /** Le mois du choix (AAAA-MM) : le choix tombe à la fin du mois. */
  month: string;
}

export interface WallSection {
  key: string;
  films: Movie[];
}

export const PIN_NOTE_MAX = 80;
/** Genres ou années montrés avant « Plus ». */
export const MAIN_CHOICES = 5;

/** La note affichée sur la carte du film. */
export const noteOf = (m: Movie): number => m.adaptiveRating?.weightedRating ?? getMovieDisplayRating(m);
export const watchedAt = (m: Movie): number => m.dateWatched || m.dateAdded;

export const monthKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const byRecent = (a: Movie, b: Movie) => watchedAt(b) - watchedAt(a);
const byNote = (a: Movie, b: Movie) => noteOf(b) - noteOf(a) || byRecent(a, b);

/** Le choix du mois en cours, ou rien : passé le mois, on revient à l'automatique. */
export const activePin = (pin: WallPin | null, now: number): WallPin | null =>
  pin && pin.month === monthKey(now) ? pin : null;

/** Les genres (ou années) du plus fourni au moins fourni ; à égalité, le plus récent ou l'alphabet. */
export function choicesOf(movies: Movie[], kind: 'genre' | 'year'): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of movies) {
    const value = kind === 'genre' ? m.genre : m.year ? String(m.year) : '';
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) =>
      kind === 'year' ? Number(b.value) - Number(a.value) : b.count - a.count || a.value.localeCompare(b.value)
    );
}

/** Le mois des films en grand en « récents » : le plus récent qui a des séances. */
export const heroMonth = (movies: Movie[]): string | null =>
  movies.length ? monthKey(Math.max(...movies.map(watchedAt))) : null;

/** Le film en grand selon le filtre, et pour « récents » selon le choix du mois. */
export function heroOf(
  movies: Movie[],
  filter: WallFilter,
  pin: WallPin | null,
  choice: string | null
): { film: Movie; mode: PinMode } | null {
  if (!movies.length) return null;
  if (filter === 'top') return { film: [...movies].sort(byNote)[0], mode: 'ever' };
  if (filter === 'genre' || filter === 'year') {
    const pool = movies.filter((m) => (filter === 'genre' ? m.genre : String(m.year)) === choice);
    return pool.length ? { film: pool.sort(byNote)[0], mode: 'ever' } : null;
  }
  const month = heroMonth(movies);
  const ofMonth = movies.filter((m) => monthKey(watchedAt(m)) === month);
  if (pin?.mode === 'pick') {
    const picked = movies.find((m) => m.id === pin.movieId);
    if (picked) return { film: picked, mode: 'pick' };
  }
  if (pin?.mode === 'last') return { film: [...movies].sort(byRecent)[0], mode: 'last' };
  if (pin?.mode === 'ever') return { film: [...movies].sort(byNote)[0], mode: 'ever' };
  return { film: ofMonth.sort(byNote)[0], mode: 'month' };
}

/** Les tranches de « mieux notés », de la meilleure à la moins bonne. */
export const NOTE_BANDS = [9, 8, 7, 6, 0] as const;
const bandOf = (note: number) => NOTE_BANDS.find((floor) => note >= floor) ?? 0;

/** La section d'un film : son mois, sa tranche de note, son genre ou son année. */
export const sectionKeyOf = (m: Movie, filter: WallFilter): string =>
  filter === 'top'
    ? String(bandOf(noteOf(m)))
    : filter === 'genre'
      ? m.genre
      : filter === 'year'
        ? String(m.year)
        : monthKey(watchedAt(m));

/** Les sections de la mosaïque, sans le film en grand. */
export function sectionsOf(movies: Movie[], filter: WallFilter, choice: string | null, heroId?: string): WallSection[] {
  const rest = movies.filter((m) => m.id !== heroId);
  if (filter === 'genre' || filter === 'year') {
    const films = rest.filter((m) => (filter === 'genre' ? m.genre : String(m.year)) === choice).sort(byNote);
    return films.length ? [{ key: choice ?? '', films }] : [];
  }
  const sorted = [...rest].sort(filter === 'top' ? byNote : byRecent);
  const sections: WallSection[] = [];
  for (const m of sorted) {
    const key = sectionKeyOf(m, filter);
    const last = sections[sections.length - 1];
    if (last?.key === key) last.films.push(m);
    else sections.push({ key, films: [m] });
  }
  return sections;
}

/** Nombre et moyenne d'une section, le film en grand compris s'il en fait partie. */
export function statsOf(movies: Movie[], filter: WallFilter, key: string): { count: number; avg: number } {
  const films = movies.filter((m) => sectionKeyOf(m, filter) === key);
  const count = films.length;
  return { count, avg: count ? films.reduce((sum, m) => sum + noteOf(m), 0) / count : 0 };
}
