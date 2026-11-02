/**
 * La séance d'un film qu'on note : devinée quand il est encore en salle, à
 * confirmer d'un appui (voir components/SeanceCard.tsx). Module pur.
 *
 * Une heure prise dans le programme est exacte ; une heure tirée d'un moment
 * (« Soirée ») ne l'est pas : la séance porte alors `APPROX_NOTE` dans ses
 * notes, et « Tes salles » la laisse hors des habitudes et des records.
 */

/** Au-delà, le film n'est plus vraiment « en salle » : on ne pose pas la question. */
export const IN_THEATERS_DAYS = 90;
export const APPROX_NOTE = 'Heure approximative';

export type Moment = 'morning' | 'afternoon' | 'evening' | 'night';
export const MOMENTS: Moment[] = ['morning', 'afternoon', 'evening', 'night'];
export const MOMENT_HOUR: Record<Moment, [number, number]> = { morning: [11, 0], afternoon: [15, 0], evening: [20, 30], night: [22, 30] };

/** Le moment d'une heure : avant midi le matin, avant 18 h l'après-midi, avant 22 h le soir. */
export const momentOf = (ts: number): Moment => {
  const h = new Date(ts).getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night';
};

const DAY = 86_400_000;

/** Sorti en salle il y a moins de 90 jours (et pas dans plus d'un jour) : encore en salle. */
export function inTheaters(releaseDate: string | undefined, now: number): boolean {
  if (!releaseDate) return false;
  const released = Date.parse(`${releaseDate}T12:00:00`);
  if (!Number.isFinite(released)) return false;
  const days = (now - released) / DAY;
  return days >= -1 && days <= IN_THEATERS_DAYS;
}

/**
 * Le moment probable de la séance, d'après l'heure à laquelle on note : on note
 * en sortant de la salle, ou le lendemain. Avant 14 h, c'était la veille au soir.
 */
export function guessMoment(now: number): { day: 'today' | 'yesterday'; moment: Moment } {
  const hour = new Date(now).getHours();
  if (hour < 14) return { day: 'yesterday', moment: 'evening' };
  if (hour < 19) return { day: 'today', moment: 'afternoon' };
  if (hour < 23) return { day: 'today', moment: 'evening' };
  return { day: 'today', moment: 'night' };
}

/** L'instant d'un moment, tel jour (aujourd'hui, hier, ou une date AAAA-MM-JJ). */
export function momentInstant(day: 'today' | 'yesterday' | string, moment: Moment, now: number): number {
  const base = day === 'today' ? new Date(now) : day === 'yesterday' ? new Date(now - DAY) : new Date(`${day}T12:00:00`);
  const [h, m] = MOMENT_HOUR[moment];
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).getTime();
}

/**
 * La séance du programme la plus probable : la dernière qui a commencé avant
 * qu'on note, en laissant le temps du film (sa durée, 2 h à défaut).
 */
export function pickShowtime<T extends { startsAt: number }>(showtimes: T[], now: number, runtimeMinutes?: number): T | null {
  const length = (runtimeMinutes && runtimeMinutes > 30 ? runtimeMinutes : 120) * 60_000;
  return [...showtimes].filter((s) => s.startsAt + length <= now + 20 * 60_000 && now - s.startsAt < 36 * 3_600_000).sort((a, b) => b.startsAt - a.startsAt)[0] ?? null;
}

/** Deux titres pour le même film, quelles que soient la casse et les accents. */
export const sameTitle = (a: string, b: string) => {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
};

/** Ce qu'il faut d'un film pour savoir s'il manque une séance. */
export interface CatchupFilm {
  id: string;
  tmdbId?: number;
  status: string;
  mediaType?: string;
  releaseDate?: string;
  dateWatched?: number;
  dateAdded: number;
  /** Où le film a été vu, tel que noté (le premier visionnage). */
  location?: 'cinema' | 'home' | 'other';
}

/**
 * Les films vus au cinéma, ou vus pendant leur sortie sans avoir dit où, qui
 * n'ont pas de séance : ceux que « Tes salles » propose de compléter. Les plus
 * récents d'abord ; ceux qu'on a passés n'y reviennent pas.
 */
export function catchupCandidates<T extends CatchupFilm>(movies: T[], screenedTmdbIds: Set<number>, skipped: Set<string>): T[] {
  return movies
    .filter((m) => m.status === 'watched' && (m.mediaType ?? 'movie') === 'movie' && !skipped.has(m.id))
    .filter((m) => m.tmdbId == null || !screenedTmdbIds.has(m.tmdbId))
    .filter((m) => {
      if (m.location === 'cinema') return true;
      if (m.location) return false;
      return inTheaters(m.releaseDate, m.dateWatched || m.dateAdded);
    })
    .sort((a, b) => (b.dateWatched || b.dateAdded) - (a.dateWatched || a.dateAdded));
}
