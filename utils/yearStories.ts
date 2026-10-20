/**
 * Les trois affiches « Mon année » : le film de l'année, la révélation et le
 * navet. Calcule ce que chaque affiche raconte à partir des films vus dans
 * l'année ; le dessin est dans components/yearStories/renderYearPoster.ts.
 *
 * Module pur, sans import : les tests le chargent tel quel. L'appelant fournit
 * des films déjà mis à plat (note affichée, critères lus par `criteriaOf`).
 */

export type YearCriterion = 'story' | 'visuals' | 'acting' | 'sound';
export const YEAR_CRITERIA: YearCriterion[] = ['story', 'visuals', 'acting', 'sound'];

export interface YearFilm {
  id: string;
  title: string;
  posterUrl?: string;
  tmdbId?: number;
  /** Note affichée sur 10. */
  score: number;
  /** Attente déclarée avant le film, sur 10. */
  hype?: number;
  /** Durée en minutes. */
  runtime?: number;
  review?: string;
  /** Détail par critère, ou null quand la note ne le donne pas. */
  criteria: Record<YearCriterion, number> | null;
  /** Jours de visionnage dans l'année, au format AAAA-MM-JJ. */
  days: string[];
}

/** Au-dessus, ce n'est plus un navet : l'affiche ne se propose pas. */
export const NAVET_MAX = 5;
/** Écart minimal entre l'attente et la note pour parler de révélation. */
export const SURPRISE_MIN = 1;
/** En dessous, l'affiche de l'année repose sur trop peu de films. */
export const MIN_FILMS = 3;
/** En dessous, une moyenne par critère dépend d'un ou deux films. */
export const MIN_DETAILED = 3;

export interface Surprise {
  film: YearFilm;
  gap: number;
}

export interface YearStories {
  /** Films différents vus dans l'année. */
  count: number;
  /** Séances, revisionnages compris. */
  viewings: number;
  /** Heures passées devant les films de l'année, revisionnages compris. */
  hours: number;
  average: number;
  best: YearFilm | null;
  /** Les suivants du classement, au plus quatre. */
  casting: YearFilm[];
  /** Le critère qui dépasse le plus ta moyenne des quatre, et de combien. */
  signature: { key: YearCriterion; gap: number } | null;
  worst: YearFilm | null;
  /** Les films qui ont le plus dépassé ton attente, du plus grand écart au plus petit. */
  surprises: Surprise[];
  navet: YearFilm | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const lastDay = (f: YearFilm) => [...f.days].sort().pop() ?? '';
/** Du mieux noté au moins bien noté ; à égalité, le plus récent d'abord. */
const byScore = (a: YearFilm, b: YearFilm) => b.score - a.score || lastDay(b).localeCompare(lastDay(a));

export function yearStories(films: YearFilm[]): YearStories {
  const rated = films.filter((f) => Number.isFinite(f.score) && f.score > 0 && f.days.length > 0);
  const ranked = [...rated].sort(byScore);
  const viewings = rated.reduce((n, f) => n + f.days.length, 0);
  const minutes = rated.reduce((n, f) => n + (f.runtime ?? 0) * f.days.length, 0);

  const detailed = rated.map((f) => f.criteria).filter((c): c is Record<YearCriterion, number> =>
    !!c && YEAR_CRITERIA.every((k) => Number.isFinite(c[k]) && c[k] > 0)
  );
  let signature: YearStories['signature'] = null;
  if (detailed.length >= MIN_DETAILED) {
    const values = YEAR_CRITERIA.map((k) => mean(detailed.map((c) => c[k])));
    const overall = mean(values);
    const top = values.indexOf(Math.max(...values));
    const gap = values[top] - overall;
    if (gap >= 0.1) signature = { key: YEAR_CRITERIA[top], gap };
  }

  const surprises = rated
    .filter((f) => typeof f.hype === 'number' && f.hype > 0)
    .map((film) => ({ film, gap: film.score - film.hype! }))
    .filter((s) => s.gap >= SURPRISE_MIN)
    .sort((a, b) => b.gap - a.gap || byScore(a.film, b.film));

  const worst = ranked.length >= 2 ? ranked[ranked.length - 1] : null;

  return {
    count: rated.length,
    viewings,
    hours: Math.round(minutes / 60),
    average: mean(rated.map((f) => f.score)),
    best: ranked[0] ?? null,
    casting: ranked.slice(1, 5),
    signature,
    worst,
    surprises,
    navet: worst && worst.score <= NAVET_MAX ? worst : null,
  };
}

/** Le meilleur critère d'un film, puis le suivant. */
export function topCriteria(criteria: Record<YearCriterion, number> | null): { key: YearCriterion; value: number }[] {
  if (!criteria) return [];
  return YEAR_CRITERIA.map((key) => ({ key, value: criteria[key] }))
    .filter((c) => Number.isFinite(c.value) && c.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Une phrase courte tirée de l'avis, pour le générique : la première phrase,
 * coupée sur un mot si elle dépasse `max` caractères. Null si l'avis est vide.
 */
export function shortQuote(review: string | undefined, max = 46): string | null {
  const text = (review ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const sentence = (text.match(/^.+?[.!?…](?=\s|$)/)?.[0] ?? text).replace(/[.]+$/, '').trim();
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[,;:]+$/, '')}…`;
}

/** Durée lisible : « 1 h 56 », « 48 min ». */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
