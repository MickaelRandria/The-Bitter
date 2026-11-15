/**
 * La semaine de cinéma, comme en salle : du mercredi au mardi.
 *
 * « Sortis cette semaine » ne garde que les sorties nationales de la semaine en
 * cours. Ce qui est sorti les cinq semaines d'avant est « toujours à
 * l'affiche », avec son ancienneté. Une sortie hors mercredi, ou seulement
 * limitée, est presque toujours une distribution restreinte : elle passe en fin
 * de liste, signalée comme telle.
 *
 * Module pur : les dates de sortie viennent de TMDB (sorties en salle France),
 * déjà chargées par l'appelant.
 */

export const STILL_SHOWING_WEEKS = 5;
/** Deux sorties à plus de quatre mois d'écart : la seconde est une ressortie. */
const RERELEASE_GAP_DAYS = 120;
const DAY_MS = 86_400_000;

export interface FrReleaseDates {
  /** Sorties en salle (type 3), triées. */
  theatrical: string[];
  /** Premières limitées (type 2), triées. */
  limited: string[];
}

export interface WeekFilmBase {
  id: number;
  title: string;
  popularity?: number;
}

export type WeekFilm<T extends WeekFilmBase> = T & {
  /** La date de sortie retenue (aaaa-mm-jj) : la dernière avant la fin de la semaine. */
  frDate: string;
  /** 1 la semaine de sa sortie, 2 la suivante… */
  weekOn: number;
  rerelease: boolean;
  /** Sortie hors mercredi, ou sans sortie nationale : distribution restreinte. */
  limited: boolean;
};

export interface CinemaWeek<T extends WeekFilmBase> {
  /** Le mercredi qui ouvre la semaine en cours. */
  weekStart: string;
  /** Le mardi qui la ferme. */
  weekEnd: string;
  /** Sorties nationales de la semaine, les plus attendues d'abord. */
  week: WeekFilm<T>[];
  /** Les cinq semaines d'avant, puis les sorties limitées. */
  still: WeekFilm<T>[];
}

const utcNoon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);
export const shiftIso = (iso: string, days: number) => toIso(utcNoon(iso) + days * DAY_MS);
/** 0 = dimanche … 3 = mercredi. */
const weekday = (iso: string) => new Date(utcNoon(iso)).getUTCDay();

/** Le mercredi qui ouvre la semaine de cinéma du jour donné (aaaa-mm-jj, heure de Paris). */
export function cinemaWeekStart(today: string): string {
  return shiftIso(today, -((weekday(today) - 3 + 7) % 7));
}

/** Le jour parisien courant, en aaaa-mm-jj. */
export function parisToday(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function buildCinemaWeek<T extends WeekFilmBase>(
  films: readonly T[],
  datesOf: (id: number) => FrReleaseDates | null | undefined,
  today: string
): CinemaWeek<T> {
  const weekStart = cinemaWeekStart(today);
  const weekEnd = shiftIso(weekStart, 6);
  const windowStart = shiftIso(weekStart, -7 * STILL_SHOWING_WEEKS);
  const week: WeekFilm<T>[] = [];
  const still: WeekFilm<T>[] = [];
  const limitedStill: WeekFilm<T>[] = [];
  const seen = new Set<number>();

  // Deux fiches TMDB pour un même film (« Face à face » / « face à face ») : la plus suivie gagne.
  const titles = new Set<string>();
  const titleKey = (title: string) => title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  for (const film of [...films].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))) {
    if (seen.has(film.id) || titles.has(titleKey(film.title))) continue;
    const dates = datesOf(film.id);
    if (!dates) continue;
    const theatrical = dates.theatrical.filter((d) => d <= weekEnd);
    const limitedDates = dates.limited.filter((d) => d <= weekEnd);
    const frDate = theatrical[theatrical.length - 1] ?? limitedDates[limitedDates.length - 1];
    if (!frDate || frDate < windowStart) continue;
    seen.add(film.id);
    titles.add(titleKey(film.title));

    const first = theatrical[0] ?? frDate;
    const rerelease = utcNoon(frDate) - utcNoon(first) > RERELEASE_GAP_DAYS * DAY_MS;
    // Un classique qui ressort (Matrix, Alien) n'est pas une nouveauté de la saison.
    if (Number(first.slice(0, 4)) < Number(today.slice(0, 4)) - 1) continue;
    // Une ressortie tombe souvent un autre jour : elle reste une sortie nationale.
    const limited = theatrical.length === 0 || (!rerelease && weekday(frDate) !== 3);
    const weekOn = Math.floor((utcNoon(weekStart) - utcNoon(cinemaWeekStart(frDate))) / (7 * DAY_MS)) + 1;
    const entry = { ...film, frDate, weekOn, rerelease, limited } as WeekFilm<T>;

    if (limited) limitedStill.push(entry);
    else if (frDate >= weekStart) week.push(entry);
    else still.push(entry);
  }

  const byPopularity = (a: WeekFilmBase, b: WeekFilmBase) => (b.popularity ?? 0) - (a.popularity ?? 0);
  return {
    weekStart,
    weekEnd,
    week: week.sort(byPopularity),
    still: [...still.sort(byPopularity), ...limitedStill.sort(byPopularity)],
  };
}
