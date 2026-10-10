/**
 * « Nos stats » et le récap du mois : ce qu'un groupe dit de lui-même, et
 * qu'aucune statistique solo ne peut dire.
 *
 * Module pur, comme `verdict.ts` : on lui passe les films, les notes et les
 * séances déjà chargés par l'espace, il rend des chiffres prêts à dessiner.
 */
import { CRITERIA, CriterionKey, VerdictRating, criteriaOf, mean, ratingValue } from './verdict';

export interface StatsFilm {
  id: string;
  title: string;
  poster_url?: string | null;
  tmdb_id?: number | null;
  genres?: string[] | null;
  runtime?: number | null;
  added_by?: string | null;
  added_at?: string | null;
  date_watched?: string | null;
  status: 'watched' | 'watchlist';
}

export interface StatsPlan {
  shared_movie_id: string | null;
  status: string;
  participant_ids: string[];
  chosen_slot_id: string | null;
  slots: { id: string; starts_at: string; cinema_name?: string | null }[];
}

export interface PairRow {
  film: StatsFilm;
  me: number;
  them: number;
  /** Moyenne des deux. */
  joint: number;
  /** Leur note moins la mienne : positif quand l'autre a plus aimé. */
  gap: number;
  /** Date de la dernière des deux notes, pour situer le film dans le temps. */
  at: string;
}

/** Les films notés par les deux, du plus récent au plus ancien. */
export const pairRows = (films: StatsFilm[], ratings: VerdictRating[], me: string, other: string): PairRow[] => {
  const byFilm = new Map<string, { me?: VerdictRating; them?: VerdictRating }>();
  for (const r of ratings) {
    if (r.profile_id !== me && r.profile_id !== other) continue;
    const entry = byFilm.get(r.movie_id) ?? {};
    if (r.profile_id === me) entry.me = r;
    else entry.them = r;
    byFilm.set(r.movie_id, entry);
  }
  const rows: PairRow[] = [];
  for (const film of films) {
    const pair = byFilm.get(film.id);
    if (!pair?.me || !pair.them) continue;
    const a = ratingValue(pair.me);
    const b = ratingValue(pair.them);
    const at = [pair.me.rated_at, pair.them.rated_at, film.date_watched, film.added_at].filter(Boolean).sort().pop() ?? '';
    rows.push({ film, me: a, them: b, joint: (a + b) / 2, gap: b - a, at });
  }
  return rows.sort((x, y) => y.at.localeCompare(x.at));
};

/** Combien de films à moins d'un point, combien où l'autre a plus aimé, combien où c'est moi. */
export const agreementSplit = (rows: PairRow[]) => ({
  close: rows.filter((r) => Math.abs(r.gap) <= 1).length,
  above: rows.filter((r) => r.gap > 1).length,
  below: rows.filter((r) => r.gap < -1).length,
});

/** Quatre films qui résument la paire : l'accord, le désaccord, et le coup de cœur de chacun. */
export const definers = (rows: PairRow[]) => {
  if (rows.length < 3) return null;
  const bestAgree = rows.filter((r) => Math.abs(r.gap) <= 0.5).sort((a, b) => b.joint - a.joint)[0] ?? null;
  const worst = [...rows].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  const mine = [...rows].filter((r) => r.gap < -1).sort((a, b) => a.gap - b.gap).find((r) => r !== worst) ?? null;
  const theirs = [...rows].filter((r) => r.gap > 1).sort((a, b) => b.gap - a.gap).find((r) => r !== worst) ?? null;
  return {
    bestAgree,
    worst: Math.abs(worst.gap) > 1 ? worst : null,
    mine,
    theirs,
  };
};

export const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * Part des films notés à moins d'un point d'écart, mois par mois. Un mois ne
 * compte qu'avec deux films au moins : un seul film ferait 0 ou 100 %.
 */
export const agreementByMonth = (rows: PairRow[]): { month: string; pct: number; count: number }[] => {
  const months = new Map<string, PairRow[]>();
  for (const r of rows) {
    if (!r.at) continue;
    const key = monthKey(r.at);
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  return [...months.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([month, list]) => ({
      month,
      count: list.length,
      pct: Math.round((list.filter((r) => Math.abs(r.gap) <= 1).length / list.length) * 100),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

/**
 * Le film du tournant : dans le mois où l'accord progresse le plus, celui sur
 * lequel la paire était la plus d'accord et qu'elle a le mieux noté.
 */
export const turningFilm = (rows: PairRow[], months: { month: string; pct: number }[]) => {
  let best: { month: string; rise: number } | null = null;
  for (let i = 1; i < months.length; i++) {
    const rise = months[i].pct - months[i - 1].pct;
    if (rise > 0 && (!best || rise > best.rise)) best = { month: months[i].month, rise };
  }
  if (!best) return null;
  const film = rows
    .filter((r) => monthKey(r.at) === best!.month && Math.abs(r.gap) <= 1)
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap) || b.joint - a.joint)[0];
  return film ? { month: best.month, row: film } : null;
};

/**
 * Écart moyen par critère (leur note moins la mienne), sur les films où nos deux
 * notes sont détaillées. Null sous deux films : un seul ne fait pas une tendance.
 */
export const criteriaDivergence = (
  films: StatsFilm[],
  ratings: VerdictRating[],
  me: string,
  other: string
): { key: CriterionKey; gap: number }[] | null => {
  const ids = new Set(films.map((f) => f.id));
  const mine = new Map(ratings.filter((r) => r.profile_id === me && ids.has(r.movie_id)).map((r) => [r.movie_id, r]));
  const diffs: Record<CriterionKey, number[]> = { story: [], visuals: [], acting: [], sound: [] };
  for (const r of ratings) {
    if (r.profile_id !== other || !mine.has(r.movie_id)) continue;
    const a = criteriaOf(mine.get(r.movie_id)!);
    const b = criteriaOf(r);
    if (!a || !b) continue;
    for (const key of CRITERIA) diffs[key].push(b[key] - a[key]);
  }
  if (diffs.story.length < 2) return null;
  return CRITERIA.map((key) => ({ key, gap: mean(diffs[key]) ?? 0 }));
};

export interface GenreRow {
  genre: string;
  me: number;
  them: number;
  count: number;
  /** Le film qui illustre le genre : le mieux noté à deux pour une valeur sûre, le plus clivant sinon. */
  best: PairRow;
  split: PairRow;
}

/** Moyenne de chacun par genre, du plus sûr au plus risqué. Deux films au moins par genre. */
export const genreDumbbell = (rows: PairRow[]): GenreRow[] => {
  const byGenre = new Map<string, PairRow[]>();
  for (const r of rows) for (const g of r.film.genres ?? []) byGenre.set(g, [...(byGenre.get(g) ?? []), r]);
  return [...byGenre.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([genre, list]) => ({
      genre,
      me: mean(list.map((r) => r.me)) ?? 0,
      them: mean(list.map((r) => r.them)) ?? 0,
      count: list.length,
      best: [...list].sort((a, b) => b.joint - a.joint)[0],
      split: [...list].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0],
    }))
    .sort((a, b) => b.me + b.them - (a.me + a.them))
    .slice(0, 6);
};

/** Qui propose, et combien l'autre en accepte (partant ou noté). */
export const whoLeads = (
  films: StatsFilm[],
  votes: { movie_id: string; profile_id: string; interested: boolean }[],
  ratings: VerdictRating[],
  me: string,
  other: string
) => {
  const accepted = (filmId: string, by: string) =>
    votes.some((v) => v.movie_id === filmId && v.profile_id === by && v.interested) ||
    ratings.some((r) => r.movie_id === filmId && r.profile_id === by);
  const mine = films.filter((f) => f.added_by === me);
  const theirs = films.filter((f) => f.added_by === other);
  const pct = (list: StatsFilm[], by: string) =>
    list.length ? Math.round((list.filter((f) => accepted(f.id, by)).length / list.length) * 100) : null;
  return { mine: mine.length, mineAccepted: pct(mine, other), theirs: theirs.length, theirsAccepted: pct(theirs, me) };
};

/** Les séances calées à deux : le soir préféré et la salle la plus fréquentée. */
export const sessionHabits = (plans: StatsPlan[], me: string, other: string) => {
  const chosen = plans
    .filter((p) => p.status === 'agreed' && p.participant_ids.includes(me) && p.participant_ids.includes(other))
    .map((p) => p.slots.find((s) => s.id === p.chosen_slot_id))
    .filter((s): s is StatsPlan['slots'][number] => !!s);
  const days = new Map<number, number>();
  const cinemas = new Map<string, number>();
  for (const s of chosen) {
    const day = new Date(s.starts_at).getDay();
    days.set(day, (days.get(day) ?? 0) + 1);
    if (s.cinema_name) cinemas.set(s.cinema_name, (cinemas.get(s.cinema_name) ?? 0) + 1);
  }
  const topDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCinema = [...cinemas.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    sessions: chosen.length,
    day: topDay ? { day: topDay[0], count: topDay[1] } : null,
    inCinema: [...cinemas.values()].reduce((a, b) => a + b, 0),
    cinema: topCinema ? { name: topCinema[0], count: topCinema[1] } : null,
  };
};

/** Écart moyen entre chaque paire de membres, sur deux films communs au moins. */
export const affinityMatrix = (ratings: VerdictRating[], memberIds: string[]) => {
  const byMember = new Map<string, Map<string, number>>();
  for (const r of ratings) {
    if (!memberIds.includes(r.profile_id)) continue;
    const m = byMember.get(r.profile_id) ?? new Map<string, number>();
    m.set(r.movie_id, ratingValue(r));
    byMember.set(r.profile_id, m);
  }
  const cell = (a: string, b: string): { gap: number; count: number } | null => {
    const ma = byMember.get(a);
    const mb = byMember.get(b);
    if (!ma || !mb) return null;
    const gaps: number[] = [];
    for (const [movie, value] of ma) if (mb.has(movie)) gaps.push(Math.abs(value - mb.get(movie)!));
    return gaps.length >= 2 ? { gap: mean(gaps)!, count: gaps.length } : null;
  };
  return { cell };
};

/** Date à laquelle un film a été vu ensemble : la séance, sinon la première note, sinon l'ajout. */
export const watchedAt = (film: StatsFilm, ratings: VerdictRating[]): string => {
  if (film.date_watched) return film.date_watched;
  const first = ratings
    .filter((r) => r.movie_id === film.id && r.rated_at)
    .map((r) => r.rated_at as string)
    .sort()[0];
  return first ?? film.added_at ?? '';
};

/** Le mois précédent, en « AAAA-MM ». */
export const previousMonth = (now = new Date()): string => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
