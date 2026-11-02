import type { CinemaScreening } from '../types';

/**
 * « Partager mon mois » : les séances d'un mois, prêtes à dessiner (voir
 * utils/monthShareRender.ts). Calcul pur, testé dans tests/monthShare.test.mjs.
 */

export type MonthShareVariant = 'calendar' | 'programme';

export interface MonthShareOptions {
  variant: MonthShareVariant;
  showCinema: boolean;
  includePast: boolean;
}

export interface MonthCell {
  /** 1 à 31 ; 0 pour les cases vides avant le 1er. */
  day: number;
  screening?: CinemaScreening;
  past: boolean;
  today: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-JJ à l'heure du téléphone. */
export const localDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Les séances du mois (AAAA-MM), dans l'ordre ; les passées seulement si on les veut. */
export function monthScreenings(screenings: CinemaScreening[], month: string, includePast: boolean, now: number): CinemaScreening[] {
  return screenings
    .filter((s) => s.status !== 'cancelled' && localDay(s.startsAt).startsWith(month))
    .filter((s) => includePast || s.startsAt >= now - 3 * 3_600_000)
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** La grille du mois, lundi en tête ; la première séance du jour sur sa case. */
export function monthGrid(month: string, screenings: CinemaScreening[], now: number): MonthCell[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const today = localDay(now);
  const cells: MonthCell[] = Array.from({ length: offset }, () => ({ day: 0, past: false, today: false }));
  for (let d = 1; d <= days; d++) {
    const key = `${month}-${pad(d)}`;
    cells.push({
      day: d,
      screening: screenings.find((s) => localDay(s.startsAt) === key),
      past: key < today,
      today: key === today,
    });
  }
  return cells;
}

/** « 20 h 30 » en français, « 8:30 PM » en anglais. */
export const formatTime = (ts: number, language: string) => {
  const d = new Date(ts);
  if (language !== 'fr') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${d.getHours()} h${d.getMinutes() ? ` ${pad(d.getMinutes())}` : ''}`;
};
