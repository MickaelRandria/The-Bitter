import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Loader2, MapPin, Plus, X } from 'lucide-react';
import { CinemaShowtime, FavoriteCinema } from '../types';
import { fetchMovieShowtimes } from '../services/cinemaDirectory';
import { SlotDraft } from '../services/plans';
import { formatSlot } from '../supabase/functions/notify/messages.ts';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';

export const MAX_SLOTS = 3;

interface Props {
  /** Titre cherché dans la grille UGC ; le titre original en second si différent. */
  titles: string[];
  favoriteCinema?: FavoriteCinema;
  value: SlotDraft[];
  onChange: (slots: SlotDraft[]) => void;
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const isoDay = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/**
 * Jusqu'à trois créneaux, pour que l'autre n'ait qu'à choisir.
 *
 * Deux sources, dans cet ordre :
 * - les vraies séances du film au cinéma favori (UGC), avec leur lien de
 *   réservation : un toucher suffit ;
 * - une saisie libre (jour, heure, lieu) pour tous les autres cinémas, qui sont
 *   la majorité : seule une poignée de comptes a un cinéma favori UGC.
 */
const PlanComposer: React.FC<Props> = ({ titles, favoriteCinema, value, onChange }) => {
  const { t } = useLanguage();
  const [showtimes, setShowtimes] = useState<CinemaShowtime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(!favoriteCinema);
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [time, setTime] = useState('20:30');
  const [place, setPlace] = useState(favoriteCinema?.name ?? '');

  // Toujours dans l'ordre du calendrier, quel que soit l'ordre de saisie.
  const commit = (next: SlotDraft[]) =>
    onChange([...next].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));

  const titleKey = titles.filter(Boolean).join('|');
  useEffect(() => {
    if (!favoriteCinema?.id || !titleKey) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchMovieShowtimes(favoriteCinema.id, titleKey.split('|'), 7).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.error) setError(result.error);
      const upcoming = result.data.filter((s) => s.startsAt > Date.now() + 15 * 60_000);
      setShowtimes(upcoming);
      // Le film ne passe pas au cinéma favori : la saisie libre est le seul chemin, on l'ouvre.
      if (upcoming.length === 0) setManualOpen(true);
    });
    return () => {
      alive = false;
    };
  }, [favoriteCinema?.id, titleKey]);

  const byDay = useMemo(() => {
    const groups = new Map<string, CinemaShowtime[]>();
    for (const showtime of showtimes) {
      const key = isoDay(new Date(showtime.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), showtime]);
    }
    return [...groups.entries()].slice(0, 7);
  }, [showtimes]);

  const full = value.length >= MAX_SLOTS;
  const isPicked = (iso: string) => value.some((s) => new Date(s.starts_at).getTime() === new Date(iso).getTime());

  const toggleShowtime = (showtime: CinemaShowtime) => {
    const iso = new Date(showtime.startsAt).toISOString();
    haptics.soft();
    if (isPicked(iso)) {
      onChange(value.filter((s) => new Date(s.starts_at).getTime() !== showtime.startsAt));
      return;
    }
    if (full) return;
    commit([
      ...value,
      {
        starts_at: iso,
        cinema_name: favoriteCinema?.name,
        cinema_id: favoriteCinema?.id,
        showtime_id: showtime.id,
        version: showtime.version,
        booking_url: showtime.bookingUrl,
      },
    ]);
  };

  const manualStart = new Date(`${day}T${time || '20:30'}`);
  const manualValid =
    Number.isFinite(manualStart.getTime()) && manualStart.getTime() > Date.now() + 10 * 60_000;

  const addManual = () => {
    if (!manualValid || full) return;
    const iso = manualStart.toISOString();
    if (isPicked(iso)) return;
    haptics.soft();
    commit([...value, { starts_at: iso, cinema_name: place.trim() || undefined }]);
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((slot) => (
            <li
              key={slot.starts_at}
              className="flex items-center justify-between gap-2 rounded-xl bg-forest/10 dark:bg-lime-400/10 px-3 py-2 text-xs font-bold text-charcoal dark:text-white"
            >
              <span className="truncate">
                {formatSlot(slot)}
                {slot.version ? ` · ${slot.version}` : ''}
              </span>
              <button
                onClick={() => onChange(value.filter((s) => s !== slot))}
                aria-label={t('plan.removeSlot')}
                className="p-1 text-stone-500 hover:text-charcoal dark:hover:text-white shrink-0"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
        {t('plan.slotsCount', { count: String(value.length), max: String(MAX_SLOTS) })}
      </p>

      {favoriteCinema && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-stone-500 dark:text-stone-400">
            <MapPin size={12} /> {t('plan.showtimesAt', { cinema: favoriteCinema.name })}
          </p>
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 size={16} className="animate-spin text-stone-400" />
            </div>
          ) : byDay.length === 0 ? (
            <p className="text-xs text-stone-400">{error ?? t('plan.noShowtimes', { cinema: favoriteCinema.name })}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {byDay.map(([key, list]) => (
                <div key={key}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                    {dayFormatter.format(new Date(list[0].startsAt))}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((showtime) => {
                      const on = isPicked(new Date(showtime.startsAt).toISOString());
                      return (
                        <button
                          key={showtime.id}
                          onClick={() => toggleShowtime(showtime)}
                          disabled={!on && full}
                          aria-pressed={on}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-30 ${
                            on
                              ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal border-transparent'
                              : 'border-stone-200 dark:border-white/10 text-charcoal dark:text-white'
                          }`}
                        >
                          {timeFormatter.format(new Date(showtime.startsAt))}
                          {showtime.version && <span className="opacity-60"> {showtime.version}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {manualOpen ? (
        <div className="rounded-2xl border border-stone-200 dark:border-white/10 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={day}
              min={isoDay(new Date())}
              onChange={(e) => setDay(e.target.value)}
              aria-label={t('plan.day')}
              className="w-full rounded-xl border border-stone-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-charcoal dark:text-white"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label={t('plan.time')}
              className="w-full rounded-xl border border-stone-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-charcoal dark:text-white"
            />
          </div>
          <input
            type="text"
            value={place}
            maxLength={120}
            onChange={(e) => setPlace(e.target.value)}
            placeholder={t('plan.placePlaceholder')}
            className="w-full rounded-xl border border-stone-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-charcoal dark:text-white placeholder:text-stone-400"
          />
          <button
            onClick={addManual}
            disabled={!manualValid || full}
            className="w-full py-2.5 rounded-xl bg-stone-100 dark:bg-white/5 text-charcoal dark:text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> {t('plan.addSlot')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setManualOpen(true)}
          disabled={full}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white disabled:opacity-40"
        >
          <CalendarPlus size={13} /> {t('plan.otherSlot')}
        </button>
      )}
    </div>
  );
};

export default PlanComposer;
