import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Navigation } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CinemaPlace,
  LatLng,
  ReturnOptions,
  currentPosition,
  hasGeoConsent,
  locateCinema,
  returnOptions,
  saveGeoConsent,
  screeningExit,
} from '../services/travel';

/**
 * « Et pour rentrer ? » dès le programme : sous les séances tardives, on dit si
 * un bus ou un tram ramène encore au point de départ à la sortie du film.
 *
 * Une requête Transitous par séance concernée, et seulement après 21 h : en
 * journée, la question ne se pose pas.
 */

/** Une séance qui finit avant ne pose pas de question de retour. */
const LATE_EXIT_HOUR = 21;
const cache = new Map<string, ReturnOptions | null>();

/** Le point de départ et le cinéma, cherchés une fois pour toute la liste. */
export function useReturnContext(cinemaName: string | undefined, city: string | undefined) {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<CinemaPlace | null>(null);
  const [asking, setAsking] = useState(false);
  const [consent, setConsent] = useState(hasGeoConsent);

  useEffect(() => {
    if (!cinemaName) return;
    const controller = new AbortController();
    locateCinema(cinemaName, city, controller.signal)
      .then(setPlace)
      .catch(() => undefined);
    return () => controller.abort();
  }, [cinemaName, city]);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    setAsking(true);
    currentPosition()
      .then((position) => {
        if (cancelled) return;
        saveGeoConsent();
        setOrigin(position);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setAsking(false));
    return () => {
      cancelled = true;
    };
  }, [consent]);

  return { origin, place, asking, consent, allow: () => setConsent(true) };
}

export function isLateShowtime(startsAt: number, endTime?: string) {
  const exit = screeningExit(startsAt, undefined, endTime);
  if (!exit) return false;
  const hour = new Date(exit).getHours();
  return hour >= LATE_EXIT_HOUR || hour < 5;
}

export function AskReturnButton({ onAllow, asking }: { onAllow: () => void; asking: boolean }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onAllow}
      disabled={asking}
      className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-100 px-3 text-[11px] font-bold text-stone-600 disabled:opacity-60 dark:bg-white/5 dark:text-stone-300"
    >
      {asking ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
      {t('route.programmeAsk')}
    </button>
  );
}

export default function ShowtimeReturn({
  id,
  startsAt,
  endTime,
  origin,
  place,
}: {
  id: string;
  startsAt: number;
  endTime?: string;
  origin: LatLng;
  place: CinemaPlace;
}) {
  const { t, language } = useLanguage();
  const exitAt = screeningExit(startsAt, undefined, endTime);
  const [options, setOptions] = useState<ReturnOptions | null | undefined>(() => cache.get(id));
  const clock = (value: number) =>
    new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
      .format(value)
      .replace(':', language === 'fr' ? ' h ' : ':');

  useEffect(() => {
    if (!exitAt || cache.has(id)) return;
    const controller = new AbortController();
    returnOptions(place, origin, exitAt, controller.signal)
      .then((found) => {
        cache.set(id, found);
        setOptions(found);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptions(null);
      });
    return () => controller.abort();
  }, [id, exitAt, place, origin]);

  if (!exitAt || !options) return null;
  if (options.noTransit) {
    return (
      <p className="mb-2.5 flex items-start gap-1.5 text-[11px] font-bold text-[#9A4A00] dark:text-[#F08A24]">
        <AlertTriangle size={13} className="mt-px shrink-0" />
        {t('route.programmeNoTransit', { time: clock(exitAt) })}
      </p>
    );
  }
  const first = options.trips[0];
  const ride = first?.legs.find((leg) => leg.line);
  if (!first) return null;
  return (
    <p className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-stone-500 dark:text-stone-400">
      <span className="h-2 w-2 rounded-full bg-forest dark:bg-bitter-lime" />
      {t('route.programmeBack', { exit: clock(exitAt) })}
      {ride && (
        <span
          className="rounded px-1.5 py-px text-[10px] font-black"
          style={{ background: ride.color ?? '#1A1A1A', color: ride.textColor ?? '#FFFFFF' }}
        >
          {ride.line}
        </span>
      )}
      <span className="text-charcoal dark:text-white">{clock(ride?.departAt ?? first.departAt)}</span>
    </p>
  );
}
