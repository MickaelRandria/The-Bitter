/**
 * Tes acteurs, tes pays et tes langues (onglet Goûts). Module pur : les films
 * arrivent mis à plat, avec leur origine déjà lue chez TMDB (voir
 * services/movieOrigins.ts).
 */

export interface CastFilm {
  id: string;
  score: number;
  /** Les noms, dans l'ordre du générique. */
  actors: string[];
  countries?: string[];
  language?: string;
}

export interface Tally {
  key: string;
  count: number;
  average: number;
}

/** Seuls les premiers rôles comptent : un figurant ne fait pas « ton acteur ». */
export const LEADS = 4;
export const MIN_ACTOR_FILMS = 3;

export const parseActors = (raw?: string) =>
  (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, LEADS);

function tally(films: CastFilm[], keysOf: (f: CastFilm) => string[]): Tally[] {
  const map = new Map<string, { count: number; sum: number }>();
  for (const f of films) {
    for (const key of new Set(keysOf(f))) {
      const row = map.get(key) ?? { count: 0, sum: 0 };
      row.count += 1;
      row.sum += f.score;
      map.set(key, row);
    }
  }
  return [...map.entries()]
    .map(([key, r]) => ({ key, count: r.count, average: r.sum / r.count }))
    .sort((a, b) => b.count - a.count || b.average - a.average);
}

export const topActors = (films: CastFilm[]) => tally(films, (f) => f.actors).filter((a) => a.count >= MIN_ACTOR_FILMS);
export const topCountries = (films: CastFilm[]) => tally(films, (f) => f.countries ?? []);
export const topLanguages = (films: CastFilm[]) => tally(films, (f) => (f.language ? [f.language] : []));

/** La meilleure moyenne parmi ceux qui ont assez de films pour qu'elle veuille dire quelque chose. */
export const bestOf = (rows: Tally[], min = 3) => [...rows].filter((r) => r.count >= min).sort((a, b) => b.average - a.average)[0] ?? null;

/**
 * Le classement en CSV, lisible par un tableur et importable dans Letterboxd
 * (colonnes tmdbID, Title, Year, Rating sur 5, WatchedDate).
 */
export function rankingCsv(rows: { tmdbId?: number; title: string; year?: number; score: number; watchedAt?: number }[]): string {
  const cell = (v: string | number | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const day = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  const lines = [['Position', 'tmdbID', 'Title', 'Year', 'Rating10', 'Rating', 'WatchedDate'].join(',')];
  rows.forEach((r, i) => {
    const five = Math.round(r.score) / 2;
    lines.push([i + 1, r.tmdbId, r.title, r.year, r.score.toFixed(1), Math.max(0.5, five), day(r.watchedAt)].map(cell).join(','));
  });
  return lines.join('\n') + '\n';
}
