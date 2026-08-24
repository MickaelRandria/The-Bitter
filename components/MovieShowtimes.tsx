import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Clock3, ExternalLink, Loader2, MapPin, Ticket } from 'lucide-react';
import { CinemaScreening, CinemaShowtime, FavoriteCinema } from '../types';
import { fetchMovieShowtimes } from '../services/cinemaDirectory';
import { createScreening, listScreeningsForMovie } from '../services/screenings';
import { haptics } from '../utils/haptics';

interface MovieShowtimesProps {
  tmdbId: number;
  /** Titre français puis titre original : UGC affiche parfois l'un, parfois l'autre. */
  titles: string[];
  posterUrl?: string;
  profileId?: string;
  favoriteCinema?: FavoriteCinema;
  onToast?: (message: string) => void;
}

const DAYS_AHEAD = 7;

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const dayLabel = (timestamp: number) => {
  const today = startOfDay(Date.now());
  const day = startOfDay(timestamp);
  const offset = Math.round((day - today) / (24 * 60 * 60 * 1_000));
  if (offset === 0) return 'Aujourd’hui';
  if (offset === 1) return 'Demain';
  return dayFormatter.format(new Date(timestamp));
};

/**
 * Les séances du film dans le cinéma favori, directement sur sa fiche.
 *
 * Toucher un horaire fait deux choses en même temps, et l'ordre compte :
 * l'onglet de réservation UGC s'ouvre **avant** toute écriture, parce qu'un
 * `window.open` déclenché après un `await` n'est plus rattaché au geste de
 * l'utilisateur et se fait bloquer par le navigateur. L'enregistrement de la
 * séance suit, en « en attente » : The Bitter ne peut pas savoir si la
 * réservation est allée à son terme, et ne programmera donc aucun rappel tant
 * que la personne ne l'aura pas confirmée.
 */
const MovieShowtimes: React.FC<MovieShowtimesProps> = ({
  tmdbId,
  titles,
  posterUrl,
  profileId,
  favoriteCinema,
  onToast,
}) => {
  const [showtimes, setShowtimes] = useState<CinemaShowtime[]>([]);
  const [existing, setExisting] = useState<CinemaScreening[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState('');
  /**
   * Les créneaux déjà envoyés à la base. Une ref, pas un état : deux touchers
   * rapprochés lisent le même rendu, et `existing` n'a pas encore bougé — le
   * calendrier se retrouverait avec deux fois la même sortie.
   */
  const submitted = useRef(new Set<string>());

  // Titre français et titre original sont souvent le même mot : un seul suffit.
  const wantedTitles = useMemo(() => [...new Set(titles.filter(Boolean))], [titles]);
  const titleKey = wantedTitles.join('|');
  const cinemaId = favoriteCinema?.id;

  useEffect(() => {
    if (!cinemaId || wantedTitles.length === 0) return;
    let cancelled = false;

    setIsLoading(true);
    setError('');
    void (async () => {
      const [result, alreadyPlanned] = await Promise.all([
        fetchMovieShowtimes(cinemaId, wantedTitles, DAYS_AHEAD),
        profileId ? listScreeningsForMovie(profileId, tmdbId) : Promise.resolve([] as CinemaScreening[]),
      ]);
      if (cancelled) return;
      submitted.current = new Set(
        alreadyPlanned.map((screening) => String(screening.startsAt))
      );
      setShowtimes(result.data);
      setExisting(alreadyPlanned);
      setError(result.error || '');
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // titleKey plutôt que le tableau : sa référence change à chaque rendu du parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinemaId, titleKey, profileId, tmdbId]);

  const days = useMemo(() => {
    const grouped = new Map<number, CinemaShowtime[]>();
    showtimes.forEach((showtime) => {
      const day = startOfDay(showtime.startsAt);
      grouped.set(day, [...(grouped.get(day) ?? []), showtime]);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [showtimes]);

  /** Une séance déjà enregistrée pour ce créneau : même horaire, même cinéma. */
  const screeningFor = (showtime: CinemaShowtime) =>
    existing.find(
      (screening) =>
        screening.startsAt === showtime.startsAt &&
        (screening.cinemaName ?? '') === (favoriteCinema?.name ?? '')
    );

  const book = (showtime: CinemaShowtime) => {
    haptics.soft();
    // Toujours en premier : c'est le geste de l'utilisateur qui autorise l'onglet.
    window.open(showtime.bookingUrl, '_blank', 'noopener,noreferrer');

    if (!profileId) return;
    if (screeningFor(showtime) || submitted.current.has(String(showtime.startsAt))) return;

    submitted.current.add(String(showtime.startsAt));
    setPendingId(showtime.id);
    void (async () => {
      const result = await createScreening(profileId, {
        tmdbId,
        title: wantedTitles[0] || showtime.title,
        posterUrl,
        startsAt: showtime.startsAt,
        cinemaName: favoriteCinema?.name,
        cinemaAddress: favoriteCinema?.city,
        format: showtime.version,
        status: 'pending',
      });
      setPendingId('');
      if (!result.ok) {
        // L'écriture a échoué : le créneau redevient disponible au toucher.
        submitted.current.delete(String(showtime.startsAt));
        onToast?.('error' in result ? result.error : 'Impossible d’ajouter cette séance.');
        return;
      }
      setExisting((current) => [...current, result.screening]);
      onToast?.('Séance ajoutée en attente. Confirme-la depuis ton calendrier une fois réservée.');
    })();
  };

  if (!favoriteCinema) {
    return (
      <div className="mb-8">
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-400">
          Au cinéma
        </h3>
        <p className="flex items-start gap-2 rounded-2xl border border-stone-200 bg-white/60 px-4 py-3 text-xs font-medium text-stone-500 dark:border-white/10 dark:bg-white/5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-stone-400" />
          Choisis ton cinéma favori dans ton profil pour voir ici les séances et réserver en un geste.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-400">
          Séances
        </h3>
        <span className="truncate text-[10px] font-bold text-stone-400">{favoriteCinema.name}</span>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-xs font-bold text-stone-400">
          <Loader2 size={14} className="animate-spin" /> Recherche des séances…
        </p>
      ) : error ? (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{error}</p>
      ) : days.length === 0 ? (
        <p className="flex items-start gap-2 text-xs font-medium text-stone-500">
          <CalendarClock size={14} className="mt-0.5 shrink-0 text-stone-400" />
          Pas de séance à {favoriteCinema.name} dans les {DAYS_AHEAD} prochains jours.
        </p>
      ) : (
        <div className="space-y-4">
          {days.map(([day, entries]) => (
            <div key={day}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-charcoal first-letter:capitalize dark:text-white">
                {dayLabel(day)}
              </p>
              <div className="flex flex-wrap gap-2">
                {entries.map((showtime) => {
                  const screening = screeningFor(showtime);
                  const isSaving = pendingId === showtime.id;
                  return (
                    <button
                      key={showtime.id}
                      onClick={() => book(showtime)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-left transition active:scale-95 ${
                        screening
                          ? 'border-bitter-lime bg-bitter-lime/15 text-charcoal dark:text-white'
                          : 'border-stone-200 bg-white text-charcoal hover:border-forest hover:bg-forest/5 dark:border-white/10 dark:bg-white/5 dark:text-white'
                      }`}
                      aria-label={`Réserver la séance de ${timeFormatter.format(new Date(showtime.startsAt))} sur ugc.fr`}
                    >
                      <span className="text-xs font-black">
                        {timeFormatter.format(new Date(showtime.startsAt))}
                      </span>
                      {showtime.version && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                          {showtime.version}
                        </span>
                      )}
                      {isSaving ? (
                        <Loader2 size={11} className="animate-spin text-stone-400" />
                      ) : screening ? (
                        <Check size={11} className="text-bitter-lime" />
                      ) : (
                        <ExternalLink size={11} className="text-stone-300 dark:text-stone-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="flex items-start gap-2 text-[10px] font-medium leading-relaxed text-stone-400">
            <Ticket size={12} className="mt-0.5 shrink-0" />
            La réservation se fait sur ugc.fr. La séance est ajoutée à ton calendrier « à confirmer » ;
            les rappels ne partiront qu’une fois que tu l’auras confirmée.
          </p>

          {existing.some((screening) => screening.status === 'pending') && (
            <p className="flex items-start gap-2 text-[10px] font-bold text-bitter-lime">
              <Clock3 size={12} className="mt-0.5 shrink-0" />
              Une séance attend ta confirmation dans le calendrier.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MovieShowtimes;
