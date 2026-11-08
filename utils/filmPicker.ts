/**
 * « De quel film tu parles ? » : le choix du film avant de dicter un avis.
 *
 * Module pur (aucun import à l'exécution) : ce qui est proposé avant de taper
 * (« À chaud », « Notés, sans avis ») et la recherche dans la collection,
 * tolérante aux accents, aux fautes de frappe, au réalisateur, aux acteurs et
 * au numéro d'une suite (« dune 2 »).
 */
import type { CinemaScreening, Movie } from '../types';

const DAY = 86_400_000;
export const HOT_DAYS = 7;
const HOT_MAX = 4;
const UNREVIEWED_MAX = 12;

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export const normalize = (text: string): string =>
  (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ratedOf = (m: Movie): boolean => {
  const r = m.ratings;
  return !!r && (r.story > 0 || r.visuals > 0 || r.acting > 0 || r.sound > 0);
};
const watchedOf = (m: Movie): boolean => m.status === 'watched';
const reviewedOf = (m: Movie): boolean => !!(m.review && m.review.trim());

/** Une œuvre entière : un film, ou la ligne-série (pas une saison). */
const pickable = (m: Movie, mediaType: 'movie' | 'tv') =>
  (m.mediaType ?? 'movie') === mediaType && m.seasonNumber == null;

export type HotPick =
  | { kind: 'movie'; movie: Movie; at: number; rated: boolean; reviewed: boolean }
  | { kind: 'screening'; screening: CinemaScreening; at: number };

/**
 * Vus ces 7 derniers jours, le plus récent d'abord : les films de la
 * collection sans avis passent devant, puis les séances passées pas encore notées.
 */
export function hotPicks(
  movies: Movie[],
  dueScreenings: CinemaScreening[],
  mediaType: 'movie' | 'tv',
  now = Date.now()
): HotPick[] {
  const since = now - HOT_DAYS * DAY;
  const fromCollection: HotPick[] = movies
    .filter((m) => pickable(m, mediaType) && watchedOf(m) && (m.dateWatched ?? 0) >= since && (m.dateWatched ?? 0) <= now)
    .map((m) => ({ kind: 'movie' as const, movie: m, at: m.dateWatched ?? 0, rated: ratedOf(m), reviewed: reviewedOf(m) }));
  const known = new Set(fromCollection.map((p) => (p.kind === 'movie' ? p.movie.tmdbId : undefined)).filter(Boolean));
  const fromScreenings: HotPick[] =
    mediaType === 'movie'
      ? dueScreenings
          .filter((s) => s.startsAt >= since && s.startsAt <= now && !(s.tmdbId && known.has(s.tmdbId)))
          .map((s) => ({ kind: 'screening' as const, screening: s, at: s.startsAt }))
      : [];
  const reviewedLast = (p: HotPick) => (p.kind === 'movie' && p.reviewed ? 1 : 0);
  return [...fromCollection, ...fromScreenings]
    .sort((a, b) => reviewedLast(a) - reviewedLast(b) || b.at - a.at)
    .slice(0, HOT_MAX);
}

/** Notés mais jamais expliqués, du plus récent au plus ancien, hors « À chaud ». */
export function unreviewed(
  movies: Movie[],
  mediaType: 'movie' | 'tv',
  exclude: Set<string> = new Set()
): { items: Movie[]; total: number } {
  const all = movies
    .filter((m) => pickable(m, mediaType) && watchedOf(m) && ratedOf(m) && !reviewedOf(m) && !exclude.has(m.id))
    .sort((a, b) => (b.dateWatched ?? b.dateAdded ?? 0) - (a.dateWatched ?? a.dateAdded ?? 0));
  return { items: all.slice(0, UNREVIEWED_MAX), total: all.length };
}

// ── Recherche ──────────────────────────────────────────────────────────────

/** Distance d'édition bornée (transpositions comprises), assez pour des fautes de frappe. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length];
}

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const ORDINALS_FR = ['', 'premiere', 'deuxieme', 'troisieme', 'quatrieme', 'cinquieme'];
const ORDINALS_EN = ['', 'one', 'two', 'three', 'four', 'five'];

/** « dune 2 » → { base: "dune", sequel: 2 }. */
export function splitSequel(query: string): { base: string; sequel: number | null } {
  const q = normalize(query);
  const m = q.match(/^(.*\S)\s+(\d{1,2})$/);
  if (!m) return { base: q, sequel: null };
  const n = Number(m[2]);
  // Une année, ou un titre qui finit vraiment par un nombre (« 1917 », « 2001 »).
  if (n < 2 || n > 10) return { base: q, sequel: null };
  return { base: m[1], sequel: n };
}

/** Le titre porte-t-il ce numéro de suite, sous une forme ou une autre ? */
export function hasSequelNumber(title: string, n: number): boolean {
  const words = normalize(title).split(' ');
  return words.includes(String(n)) || words.includes(ROMAN[n]) || words.includes(ORDINALS_FR[n] ?? '') || words.includes(ORDINALS_EN[n] ?? '');
}

/** Un mot tapé retrouve-t-il un mot du texte : début de mot, ou faute de frappe. */
const tokenHit = (token: string, words: string[]): 'exact' | 'prefix' | 'fuzzy' | null => {
  let best: 'exact' | 'prefix' | 'fuzzy' | null = null;
  for (const w of words) {
    if (w === token) return 'exact';
    if (w.startsWith(token) && token.length >= 2) best = 'prefix';
    else if (!best && token.length >= 5 && w.length >= 4 && editDistance(token, w, token.length >= 7 ? 2 : 1) <= (token.length >= 7 ? 2 : 1)) best = 'fuzzy';
  }
  return best;
};

/** Tous les mots tapés se retrouvent-ils ? Score de 0 (non) à 1 (exact). */
const matchAll = (tokens: string[], text: string): number => {
  if (!tokens.length) return 0;
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return 0;
  let total = 0;
  for (const t of tokens) {
    const hit = tokenHit(t, words);
    if (!hit) return 0;
    total += hit === 'exact' ? 1 : hit === 'prefix' ? 0.8 : 0.55;
  }
  return total / tokens.length;
};

export type MatchReason = 'title' | 'director' | 'actor';

export interface CollectionMatch {
  movie: Movie;
  score: number;
  reason: MatchReason;
}

/** Les films de la collection qui répondent à la recherche, le meilleur d'abord. */
export function searchCollection(movies: Movie[], query: string, mediaType: 'movie' | 'tv', max = 5): CollectionMatch[] {
  const { base, sequel } = splitSequel(query);
  const tokens = base.split(' ').filter(Boolean);
  const year = tokens.find((t) => /^(19|20)\d\d$/.test(t));
  const words = tokens.filter((t) => t !== year);
  if (!words.length || normalize(query).length < 2) return [];
  const out: CollectionMatch[] = [];
  for (const m of movies) {
    if (!pickable(m, mediaType)) continue;
    const title = matchAll(words, m.title);
    const director = matchAll(words, m.director || '');
    const actor = matchAll(words, m.actors || '');
    let score = Math.max(title, director * 0.85, actor * 0.7);
    if (score === 0) continue;
    const reason: MatchReason = score === title ? 'title' : score === director * 0.85 ? 'director' : 'actor';
    if (reason === 'title' && normalize(m.title).startsWith(words.join(' '))) score += 0.2;
    if (year && String(m.year) === year) score += 0.15;
    if (sequel != null) score += hasSequelNumber(m.title, sequel) ? 0.3 : -0.2;
    if (watchedOf(m) && ratedOf(m) && !reviewedOf(m)) score += 0.05;
    out.push({ movie: m, score, reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

export interface RemoteFilm {
  id: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterPath?: string | null;
  popularity?: number;
}

/**
 * Les résultats TMDB rangés : seulement ceux dont le titre (ou le titre
 * original) répond à tous les mots tapés, ceux qui portent le numéro de suite
 * demandé d'abord, puis dans l'ordre de TMDB ; sans ceux déjà dans la collection.
 * `query` vide : pas de filtre (filmographie d'une personne).
 */
export function rankRemote(results: RemoteFilm[], query: string, ownedTmdbIds: Set<number>, max = 8): RemoteFilm[] {
  const { base, sequel } = splitSequel(query);
  const words = base.split(' ').filter((w) => w && !/^(19|20)\d\d$/.test(w));
  const seen = new Set<number>();
  return results
    .filter((r) => {
      if (ownedTmdbIds.has(r.id) || seen.has(r.id)) return false;
      if (words.length && !matchAll(words, r.title) && !matchAll(words, r.originalTitle ?? '')) return false;
      seen.add(r.id);
      return true;
    })
    .map((r, i) => ({ r, i, s: sequel != null && (hasSequelNumber(r.title, sequel) || hasSequelNumber(r.originalTitle ?? '', sequel)) ? 1 : 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ r }) => r)
    .slice(0, max);
}

/** Une personne trouvée par TMDB vaut-elle une filmographie : son nom répond bien à la recherche. */
export const personMatches = (name: string, query: string): boolean => {
  // « dune 2 » cherche une suite, pas quelqu'un.
  if (splitSequel(query).sequel != null) return false;
  const words = normalize(query).split(' ').filter((w) => w.length >= 3);
  return words.length > 0 && matchAll(words, name) >= 0.55;
};
