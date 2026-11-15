/**
 * Mes séances à venir, une seule fois pour toute l'application.
 *
 * Un film pour lequel j'ai déjà une place (billet scanné ou séance notée à la
 * main) doit se reconnaître partout : la carte « À voir » l'annonce, la frise des
 * sorties le marque, le calendrier n'annonce plus sa sortie et les suggestions
 * ne le proposent plus. Toutes ces vues lisent cette même liste.
 *
 * Chaque écriture dans `cinema_screenings` (création, confirmation, annulation,
 * QR code…) émet `SCREENINGS_CHANGED`, et la liste se recharge d'elle-même.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CinemaScreening } from '../types';
import { listUpcomingScreenings, SCREENINGS_CHANGED } from './screenings';
import { myScreeningFor } from '../utils/myPlace';

export { notifyScreeningsChanged } from './screenings';

let current: { profileId: string; list: CinemaScreening[] } | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const load = (profileId: string) => {
  if (inflight) return inflight;
  inflight = listUpcomingScreenings(profileId)
    .then((list) => {
      current = { profileId, list };
      listeners.forEach((listener) => listener());
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

if (typeof window !== 'undefined') {
  window.addEventListener(SCREENINGS_CHANGED, () => {
    if (current) void load(current.profileId);
  });
}

export function useUpcomingScreenings(profileId: string | undefined): CinemaScreening[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!profileId) return;
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    if (current?.profileId !== profileId) {
      current = null;
      void load(profileId);
    }
    return () => {
      listeners.delete(listener);
    };
  }, [profileId]);
  return profileId && current?.profileId === profileId ? current.list : EMPTY;
}

const EMPTY: CinemaScreening[] = [];

/**
 * Pour chaque film, ma prochaine place : séance prévue ou à confirmer, pas
 * encore finie (même fenêtre que « Ta place » dans les espaces).
 */
export function placesByFilm(screenings: readonly CinemaScreening[], now = Date.now()): Map<number, CinemaScreening> {
  const places = new Map<number, CinemaScreening>();
  for (const id of new Set(screenings.map((s) => s.tmdbId).filter((v): v is number => typeof v === 'number'))) {
    const place = myScreeningFor(screenings as CinemaScreening[], id, now);
    if (place) places.set(id, place);
  }
  return places;
}

export function useMyPlaces(profileId: string | undefined): Map<number, CinemaScreening> {
  const list = useUpcomingScreenings(profileId);
  return useMemo(() => placesByFilm(list), [list]);
}
