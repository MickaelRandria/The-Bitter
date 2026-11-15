/**
 * Le retour d'UGC.
 *
 * Toucher un horaire ouvre la réservation UGC et note la séance « à confirmer ».
 * On retient ce départ ; au retour dans l'app, la question « Alors, tu as tes
 * places ? » s'ouvre une seule fois. Rien n'est tenu pour acquis : une séance
 * à confirmer n'est pas « Ta place ».
 */

const TRIP_KEY = 'bitter:ugc-trip';
/** En dessous, l'onglet UGC s'est à peine ouvert : ce n'est pas un retour. */
const MIN_AWAY_MS = 10_000;
/** Au-delà, la question ne se pose plus au retour : la carte du calendrier et la notification de la veille prennent le relais. */
const MAX_AWAY_MS = 3 * 3_600_000;

/** Ouvrir la question depuis n'importe où (carte du calendrier, pastille, notification). */
export const BOOKING_RETURN_EVENT = 'bitter:booking-return';
export type BookingReturnStep = 'ask' | 'yes' | 'no';

export const openBookingReturn = (screeningId: string, step: BookingReturnStep = 'ask') => {
  if (typeof window === 'undefined' || !screeningId) return;
  window.dispatchEvent(new CustomEvent(BOOKING_RETURN_EVENT, { detail: { screeningId, step } }));
};

export function rememberBookingTrip(screeningId: string, now = Date.now()) {
  try {
    localStorage.setItem(TRIP_KEY, JSON.stringify({ screeningId, at: now }));
  } catch {
    /* Sans stockage, la carte du calendrier et la notification de la veille suffisent. */
  }
}

/**
 * Le départ vers UGC à questionner, s'il y en a un : retiré dès qu'il est lu,
 * pour que la question ne revienne pas à chaque retour au premier plan.
 */
export function takeBookingTrip(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(TRIP_KEY);
    if (!raw) return null;
    const trip = JSON.parse(raw) as { screeningId?: unknown; at?: unknown };
    const away = now - Number(trip.at);
    // Trop tôt : on garde le départ pour le vrai retour.
    if (away < MIN_AWAY_MS) return null;
    localStorage.removeItem(TRIP_KEY);
    if (away > MAX_AWAY_MS || typeof trip.screeningId !== 'string') return null;
    return trip.screeningId;
  } catch {
    return null;
  }
}
