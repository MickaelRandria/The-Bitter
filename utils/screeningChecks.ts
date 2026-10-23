/**
 * Remarques sur les séances à venir : ce qui a l'air d'une erreur et mérite
 * une question plutôt qu'un silence.
 *
 * - le même film deux fois (un billet importé en double, une séance reprogrammée
 *   sans supprimer l'ancienne) ;
 * - deux séances qui se chevauchent ;
 * - une séance pour un film déjà vu : revisionnage, ou erreur de film ;
 * - une séance pour un film absent de la collection, à ajouter à sa liste.
 *
 * Module pur, sans import : la page Calendrier s'en sert, les tests le chargent
 * tel quel (tests/screeningChecks.test.mjs).
 */

export interface CheckedScreening {
  id: string;
  tmdbId?: number;
  title: string;
  startsAt: number;
  cinemaName?: string;
  status: string;
}

export interface CheckedMovie {
  tmdbId?: number;
  title: string;
  status: string;
  mediaType?: string;
  seasonNumber?: number;
  dateWatched?: number;
  runtime?: number;
}

export type ScreeningCheck =
  | { kind: 'duplicate'; key: string; title: string; screenings: CheckedScreening[] }
  | { kind: 'overlap'; key: string; first: CheckedScreening; second: CheckedScreening }
  | { kind: 'alreadySeen'; key: string; screening: CheckedScreening; seenAt: number }
  | { kind: 'notInCollection'; key: string; screening: CheckedScreening };

/** Durée prise quand on ne connaît pas celle du film : un long métrage moyen, pub comprise. */
export const DEFAULT_RUNTIME_MINUTES = 120;
/** Battement minimal entre deux séances pour ne pas parler de chevauchement. */
const OVERLAP_MARGIN_MS = 10 * 60_000;

const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Même film : par la fiche TMDB quand les deux en ont une, sinon par le titre. */
export const sameFilm = (a: { tmdbId?: number; title: string }, b: { tmdbId?: number; title: string }) =>
  a.tmdbId && b.tmdbId ? a.tmdbId === b.tmdbId : normalise(a.title) === normalise(b.title);

const filmKey = (s: CheckedScreening) => (s.tmdbId ? `tmdb:${s.tmdbId}` : `titre:${normalise(s.title)}`);

const isActive = (s: CheckedScreening, now: number) =>
  (s.status === 'scheduled' || s.status === 'pending') && s.startsAt > now;

const personalFilm = (movies: readonly CheckedMovie[], s: CheckedScreening) =>
  movies.find((m) => m.mediaType !== 'tv' && m.seasonNumber == null && sameFilm(m, s));

export function screeningChecks(
  screenings: readonly CheckedScreening[],
  movies: readonly CheckedMovie[],
  now: number,
  dismissed: ReadonlySet<string> = new Set(),
): ScreeningCheck[] {
  const upcoming = screenings.filter((s) => isActive(s, now)).sort((a, b) => a.startsAt - b.startsAt);
  const checks: ScreeningCheck[] = [];

  // Le même film plusieurs fois.
  const byFilm = new Map<string, CheckedScreening[]>();
  for (const s of upcoming) byFilm.set(filmKey(s), [...(byFilm.get(filmKey(s)) ?? []), s]);
  const duplicated = new Set<string>();
  for (const group of byFilm.values()) {
    if (group.length < 2) continue;
    group.forEach((s) => duplicated.add(s.id));
    checks.push({
      kind: 'duplicate',
      key: `duplicate:${group.map((s) => s.id).sort().join(',')}`,
      title: group[0].title,
      screenings: group,
    });
  }

  // Deux films différents qui se chevauchent.
  for (let i = 0; i < upcoming.length; i++) {
    const first = upcoming[i];
    const runtime = personalFilm(movies, first)?.runtime || DEFAULT_RUNTIME_MINUTES;
    const end = first.startsAt + runtime * 60_000 - OVERLAP_MARGIN_MS;
    for (let j = i + 1; j < upcoming.length && upcoming[j].startsAt < end; j++) {
      const second = upcoming[j];
      if (sameFilm(first, second)) continue;
      checks.push({ kind: 'overlap', key: `overlap:${first.id}:${second.id}`, first, second });
    }
  }

  for (const s of upcoming) {
    if (duplicated.has(s.id)) continue;
    const film = personalFilm(movies, s);
    if (!film) {
      // Sans fiche TMDB, on ne saurait pas quoi ajouter à la liste.
      if (s.tmdbId) checks.push({ kind: 'notInCollection', key: `missing:${s.id}`, screening: s });
      continue;
    }
    if (film.status === 'watched' && film.dateWatched != null && film.dateWatched < s.startsAt) {
      checks.push({ kind: 'alreadySeen', key: `seen:${s.id}`, screening: s, seenAt: film.dateWatched });
    }
  }

  return checks.filter((c) => !dismissed.has(c.key));
}

/** Remarques écartées d'un « c'est voulu », gardées sur l'appareil. */
export const DISMISSED_CHECKS_KEY = 'bitter:screening-checks:dismissed';

export function parseDismissed(raw: string | null): Set<string> {
  try {
    const list = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Une autre séance à venir du même film, à une autre heure : de quoi demander
 * « deux séances, c'est voulu ? » avant d'en ajouter une.
 */
export function otherScreeningOfFilm(
  screenings: readonly CheckedScreening[],
  film: { tmdbId?: number; title: string; startsAt: number },
  now: number,
): CheckedScreening | undefined {
  return screenings
    .filter((s) => isActive(s, now) && Math.abs(s.startsAt - film.startsAt) >= 60_000 && sameFilm(s, film))
    .sort((a, b) => a.startsAt - b.startsAt)[0];
}
