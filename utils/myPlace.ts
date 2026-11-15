import type { CinemaScreening } from '../types';

/** Deux séances à moins d'un quart d'heure d'écart sont la même séance. */
export const SAME_SCREENING_MS = 15 * 60_000;

/** Une séance encore utile : jusqu'à trois heures après son début (le film dure). */
const STILL_RELEVANT_MS = 3 * 3_600_000;

/**
 * Ma place pour un film : la prochaine séance de mon calendrier sur ce film
 * (billet scanné, saisie à la main, réservée depuis l'app), annulées exclues.
 */
export function myScreeningFor(
  screenings: CinemaScreening[],
  tmdbId: number | null | undefined,
  now = Date.now()
): CinemaScreening | null {
  if (!tmdbId) return null;
  return (
    screenings
      .filter((s) => s.tmdbId === tmdbId && s.status !== 'cancelled' && s.startsAt + STILL_RELEVANT_MS > now)
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}

const normalise = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Même film, même heure à un quart d'heure près, même cinéma quand les deux le disent. */
export function isSameScreening(
  a: { startsAt: number; cinemaName?: string | null },
  b: { startsAt: number; cinemaName?: string | null }
): boolean {
  if (Math.abs(a.startsAt - b.startsAt) > SAME_SCREENING_MS) return false;
  const ca = normalise(a.cinemaName);
  const cb = normalise(b.cinemaName);
  return !ca || !cb || ca === cb;
}

/** Le créneau à proposer à l'espace, tiré de ma séance. */
export function slotFromScreening(screening: CinemaScreening) {
  return {
    starts_at: new Date(screening.startsAt).toISOString(),
    cinema_name: screening.cinemaName,
    version: screening.format,
    booking_url: screening.bookingUrl,
  };
}
