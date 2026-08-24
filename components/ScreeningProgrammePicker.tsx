import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  ExternalLink,
  Film,
  Loader2,
  MapPin,
  PenLine,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import {
  CinemaProgramme,
  CinemaProgrammeFilm,
  CinemaScreeningInput,
  CinemaShowtime,
  FavoriteCinema,
  TMDBSearchResult,
} from '../types';
import { CinemaCity, CinemaOption, fetchCinemaProgramme, searchCinemaCities, searchCinemasNearCity } from '../services/cinemaDirectory';
import { createScreening } from '../services/screenings';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';

interface ScreeningProgrammePickerProps {
  profileId: string;
  favoriteCinema?: FavoriteCinema;
  onClose: () => void;
  onCreated: () => void;
  /** Repli assumé : festival, cinéma non UGC, séance déjà passée. */
  onManualEntry: () => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  onToast?: (message: string) => void;
}

const DEFAULT_REMINDERS = [2_880, 30];
const REMINDER_CHOICES: [number, string][] = [[2_880, 'J-2'], [120, '2 h'], [30, '30 min']];

const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const dayLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** « Auj. », « Demain », puis le jour abrégé. Les libellés viennent de l'ISO, jamais du jj/mm/aaaa. */
const dayLabel = (iso: string, long = false) => {
  const date = new Date(`${iso}T12:00:00`);
  const offset = Math.round((startOfDay(date.getTime()) - startOfDay(Date.now())) / 86_400_000);
  if (offset === 0) return long ? "Aujourd’hui" : 'Auj.';
  if (offset === 1) return 'Demain';
  return (long ? dayLong : dayShort).format(date);
};

const normalise = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');

/**
 * Choisir une séance dans le vrai programme, au lieu de la ressaisir.
 *
 * Le parcours suit ce qu'UGC publie : un cinéma, un jour, un film, un horaire.
 * Trois de ces quatre choix sont souvent déjà faits — le cinéma favori est
 * pré-rempli, le jour retenu par défaut est le premier qui a encore des séances
 * à vendre, et un film n'a parfois qu'un seul horaire.
 *
 * Deux sorties, et la distinction est celle de toute la fonctionnalité :
 * « Réserver sur UGC » ouvre la billetterie et n'engage rien — la séance reste
 * en attente et ne programme aucun rappel ; « J'ai déjà ma place » affirme la
 * réservation, et programme les rappels tout de suite.
 */
const ScreeningProgrammePicker: React.FC<ScreeningProgrammePickerProps> = ({
  profileId,
  favoriteCinema,
  onClose,
  onCreated,
  onManualEntry,
  onAddToWatchlist,
  onToast,
}) => {
  const dialog = useDialog(onClose, 'Choisir une séance');

  const [cinema, setCinema] = useState<FavoriteCinema | undefined>(favoriteCinema);
  const [isChangingCinema, setIsChangingCinema] = useState(!favoriteCinema);
  const [programme, setProgramme] = useState<CinemaProgramme | null>(null);
  const [requestedDate, setRequestedDate] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [film, setFilm] = useState<CinemaProgrammeFilm | null>(null);

  // Rapprochement TMDB du film choisi : une seule recherche, confirmée à l'écran.
  const [match, setMatch] = useState<TMDBSearchResult | null>(null);
  const [matchOptions, setMatchOptions] = useState<TMDBSearchResult[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [showMatchOptions, setShowMatchOptions] = useState(false);

  const [reminders, setReminders] = useState<number[]>(DEFAULT_REMINDERS);
  const [alsoWatchlist, setAlsoWatchlist] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [saveError, setSaveError] = useState('');
  const savedOnce = useRef(false);

  // --- Sélection du cinéma (repris du parcours existant) -------------------
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CinemaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CinemaCity | null>(null);
  const [cinemas, setCinemas] = useState<CinemaOption[]>([]);
  const [isCinemaLoading, setIsCinemaLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');

  useEffect(() => {
    const clean = cityQuery.trim();
    if (clean.length < 2 || selectedCity?.label === cityQuery) {
      setCityResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCinemaCities(clean).then((result) => {
        setCityResults(result.data);
        setDirectoryError(result.error || '');
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cityQuery, selectedCity?.label]);

  const chooseCity = async (city: CinemaCity) => {
    setSelectedCity(city);
    setCityQuery(city.label);
    setCityResults([]);
    setCinemas([]);
    setDirectoryError('');
    setIsCinemaLoading(true);
    try {
      const result = await searchCinemasNearCity(city);
      setCinemas(result.data);
      setDirectoryError(result.error || (result.data.length === 0 ? 'Aucun cinéma UGC dans cette ville.' : ''));
    } catch (caught) {
      console.warn('[Séances] Sélection de ville interrompue', caught);
      setDirectoryError('Impossible de charger les cinémas UGC de cette ville.');
    } finally {
      setIsCinemaLoading(false);
    }
  };

  // --- Chargement du programme --------------------------------------------
  useEffect(() => {
    if (!cinema?.id) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await fetchCinemaProgramme(cinema.id, requestedDate);
        if (cancelled) return;
        setProgramme(result.data);
        setError(result.error || '');
      } catch (caught) {
        console.warn('[Séances] Programme interrompu', caught);
        if (!cancelled) setError('Le programme n’a pas pu être chargé.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cinema?.id, requestedDate]);

  // --- Rapprochement TMDB du film choisi -----------------------------------
  useEffect(() => {
    if (!film) return;
    let cancelled = false;
    setIsMatching(true);
    setMatch(null);
    setMatchOptions([]);
    setShowMatchOptions(false);
    void (async () => {
      try {
        const response = await fetch(
          `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(film.title)}&page=1`
        );
        const data = await response.json();
        if (cancelled) return;
        const results: TMDBSearchResult[] = (data.results || []).slice(0, 5);
        setMatchOptions(results);
        setMatch(results[0] ?? null);
      } catch (caught) {
        // Sans fiche TMDB la séance reste enregistrable : le titre libre suffit.
        console.warn('[Séances] Rapprochement TMDB indisponible', caught);
      } finally {
        if (!cancelled) setIsMatching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [film]);

  const films = useMemo(() => {
    const clean = normalise(query.trim());
    if (!programme) return [];
    if (!clean) return programme.films;
    return programme.films.filter((entry) => normalise(entry.title).includes(clean));
  }, [programme, query]);

  const toggleReminder = (offset: number) =>
    setReminders((current) =>
      current.includes(offset) ? current.filter((value) => value !== offset) : [...current, offset].sort((a, b) => b - a)
    );

  const buildInput = (showtime: CinemaShowtime): CinemaScreeningInput => ({
    tmdbId: match?.id,
    title: match?.title || match?.name || film?.title || '',
    posterUrl: match?.poster_path ? `${TMDB_IMAGE_URL}${match.poster_path}` : film?.posterUrl,
    startsAt: showtime.startsAt,
    cinemaName: cinema?.name,
    cinemaAddress: cinema?.city,
    format: showtime.version,
    reminderOffsetsMinutes: reminders,
  });

  const save = async (showtime: CinemaShowtime, status: 'pending' | 'scheduled') => {
    if (savedOnce.current) return;
    if (reminders.length === 0) {
      setSaveError('Choisis au moins un rappel.');
      return;
    }
    savedOnce.current = true;
    setSaveError('');
    setSavingId(`${showtime.id}-${status}`);

    const result = await createScreening(profileId, { ...buildInput(showtime), status });
    setSavingId('');
    if (!result.ok) {
      savedOnce.current = false;
      setSaveError('error' in result ? result.error : 'Impossible d’enregistrer la séance.');
      return;
    }
    if (alsoWatchlist && match?.id) onAddToWatchlist?.(match.id);
    onCreated();
    onToast?.(
      status === 'pending'
        ? 'Séance ajoutée en attente. Confirme-la dans ton calendrier une fois réservée.'
        : 'Séance planifiée. Les rappels The Bitter sont prêts.'
    );
    onClose();
  };

  const book = (showtime: CinemaShowtime) => {
    haptics.soft();
    // Avant tout `await` : passé le geste de l'utilisateur, le navigateur bloque.
    window.open(showtime.bookingUrl, '_blank', 'noopener,noreferrer');
    void save(showtime, 'pending');
  };

  const fieldClass =
    'h-12 w-full appearance-none rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-charcoal outline-none transition focus:border-bitter-lime focus:ring-4 focus:ring-bitter-lime/10 dark:border-white/10 dark:bg-[#191919] dark:text-white';
  const labelClass = 'mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-stone-400';

  return (
    <div {...dialog.props} className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/70 backdrop-blur-md" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">

        <header className="flex items-start justify-between gap-3 border-b border-stone-200/80 px-6 pb-5 pt-6 dark:border-white/10">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-bitter-lime">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-bitter-lime/15"><Ticket size={14} /></span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">The Bitter · cinéma</span>
            </div>
            <h2 className="truncate text-2xl font-black tracking-tight text-charcoal dark:text-white">
              {film ? film.title : 'Choisir une séance'}
            </h2>
            <p className="mt-1 truncate text-xs font-medium text-stone-500 dark:text-stone-400">
              {film
                ? `${cinema?.name ?? ''} · ${programme ? dayLabel(programme.days.find((d) => d.date === programme.date)?.iso ?? '', true) : ''}`
                : 'Dans le vrai programme, pas à la main.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-stone-500 shadow-sm transition hover:text-charcoal dark:bg-white/10 dark:text-stone-400 dark:hover:text-white"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-6">

          {/* ---------- Choix du cinéma ---------- */}
          {isChangingCinema ? (
            <section>
              <label className={labelClass}>Dans quel cinéma ?</label>
              <div className="relative">
                <MapPin size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  value={cityQuery}
                  onChange={(event) => {
                    setCityQuery(event.target.value);
                    setSelectedCity(null);
                    setCinemas([]);
                    setDirectoryError('');
                  }}
                  placeholder="Ville UGC (Lyon, Paris…)"
                  className={`${fieldClass} pl-11`}
                />
              </div>
              {cityResults.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#191919]">
                  {cityResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => void chooseCity(city)}
                      className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <span className="text-sm font-bold text-charcoal dark:text-white">{city.label}</span>
                      <span className="text-[11px] font-bold text-stone-400">UGC</span>
                    </button>
                  ))}
                </div>
              )}
              {isCinemaLoading && (
                <p className="mt-3 flex items-center gap-2 text-xs font-bold text-stone-400">
                  <Loader2 size={14} className="animate-spin" /> Recherche des UGC…
                </p>
              )}
              {cinemas.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-[#191919]">
                  {cinemas.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setCinema({ id: option.id, name: option.name, city: option.address });
                        setIsChangingCinema(false);
                        setFilm(null);
                        setRequestedDate(undefined);
                        setProgramme(null);
                      }}
                      className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <MapPin size={14} className="shrink-0 text-bitter-lime" />
                      <span className="text-sm font-bold text-charcoal dark:text-white">{option.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {directoryError && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{directoryError}</p>}
              {cinema && (
                <button
                  onClick={() => setIsChangingCinema(false)}
                  className="mt-4 text-xs font-black text-stone-500 underline decoration-stone-300 underline-offset-4 dark:text-stone-400 dark:decoration-white/20"
                >
                  Revenir à {cinema.name}
                </button>
              )}
            </section>
          ) : (
            <button
              onClick={() => setIsChangingCinema(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-forest dark:border-white/10 dark:bg-white/5 dark:hover:border-bitter-lime"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <MapPin size={15} className="shrink-0 text-bitter-lime" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-charcoal dark:text-white">{cinema?.name}</span>
                  <span className="block truncate text-[11px] font-bold text-stone-400">{cinema?.city}</span>
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-forest dark:text-lime-500">Changer</span>
            </button>
          )}

          {/* ---------- Programme ---------- */}
          {cinema && !isChangingCinema && (
            <>
              {isLoading ? (
                <p className="flex items-center gap-2 py-6 text-xs font-bold text-stone-400">
                  <Loader2 size={14} className="animate-spin" /> Chargement du programme…
                </p>
              ) : error ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{error}</p>
                  <button
                    onClick={() => setRequestedDate((current) => (current ? undefined : current))}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-stone-500 dark:border-white/10 dark:text-stone-400"
                  >
                    Réessayer
                  </button>
                </div>
              ) : programme ? (
                film ? (
                  /* ---------- Étape 2 : le film choisi ---------- */
                  <>
                    <button
                      onClick={() => setFilm(null)}
                      className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400"
                    >
                      <ChevronLeft size={14} /> Tous les films
                    </button>

                    <section>
                      <label className={labelClass}>Fiche du film</label>
                      {isMatching ? (
                        <p className="flex items-center gap-2 text-xs font-bold text-stone-400">
                          <Loader2 size={13} className="animate-spin" /> Recherche de la fiche…
                        </p>
                      ) : match ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-[#252525]">
                            {match.poster_path && (
                              <img src={resizeTmdbImage(`${TMDB_IMAGE_URL}${match.poster_path}`, 'w92')} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-charcoal dark:text-white">{match.title || match.name}</p>
                            <p className="text-[11px] font-bold text-stone-400">
                              {(match.release_date || '').slice(0, 4) || 'année inconnue'}
                            </p>
                          </div>
                          <button
                            onClick={() => setShowMatchOptions((open) => !open)}
                            className="shrink-0 text-[10px] font-black uppercase tracking-wider text-forest dark:text-lime-500"
                          >
                            {showMatchOptions ? 'Fermer' : 'Pas ce film ?'}
                          </button>
                        </div>
                      ) : (
                        <p className="flex items-start gap-2 rounded-2xl border border-stone-200 bg-white/60 px-4 py-3 text-xs font-medium text-stone-500 dark:border-white/10 dark:bg-white/5 dark:text-stone-400">
                          <Film size={14} className="mt-0.5 shrink-0 text-stone-400" />
                          Aucune fiche trouvée pour « {film.title} ». La séance sera enregistrée sous ce titre.
                        </p>
                      )}

                      {showMatchOptions && matchOptions.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-[#191919]">
                          {matchOptions.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                setMatch(option);
                                setShowMatchOptions(false);
                              }}
                              className="flex w-full items-center gap-3 border-b border-stone-100 px-3 py-2.5 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"
                            >
                              <div className="h-11 w-8 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-[#252525]">
                                {option.poster_path && (
                                  <img src={resizeTmdbImage(`${TMDB_IMAGE_URL}${option.poster_path}`, 'w92')} alt="" className="h-full w-full object-cover" />
                                )}
                              </div>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-charcoal dark:text-white">
                                {option.title || option.name}
                              </span>
                              <span className="text-[11px] font-medium text-stone-400">{(option.release_date || '').slice(0, 4)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>

                    <section>
                      <label className={labelClass}>Horaires · {film.showtimes.length} séance{film.showtimes.length > 1 ? 's' : ''}</label>
                      <div className="space-y-2">
                        {film.showtimes.map((showtime) => {
                          const isSaving = savingId.startsWith(showtime.id);
                          return (
                            <div
                              key={showtime.id}
                              className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-white/5"
                            >
                              <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="text-lg font-black text-charcoal dark:text-white">
                                  {timeFormatter.format(new Date(showtime.startsAt))}
                                </span>
                                {showtime.endTime && <span className="text-[11px] font-bold text-stone-400">fin {showtime.endTime}</span>}
                                {showtime.version && (
                                  <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-stone-500 dark:bg-[#252525] dark:text-stone-400">
                                    {showtime.version}
                                  </span>
                                )}
                                {showtime.room && <span className="text-[11px] font-bold text-stone-400">{showtime.room}</span>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => book(showtime)}
                                  disabled={!!savingId}
                                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-charcoal px-3 text-[10px] font-black uppercase tracking-wider text-white transition active:scale-95 disabled:opacity-50 dark:bg-bitter-lime dark:text-charcoal"
                                >
                                  {isSaving && savingId.endsWith('pending') ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                                  Réserver sur UGC
                                </button>
                                <button
                                  onClick={() => void save(showtime, 'scheduled')}
                                  disabled={!!savingId}
                                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-200 px-3 text-[10px] font-black uppercase tracking-wider text-stone-500 transition active:scale-95 disabled:opacity-50 dark:border-white/10 dark:text-stone-300"
                                >
                                  {isSaving && savingId.endsWith('scheduled') ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  J’ai déjà ma place
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10px] font-medium leading-relaxed text-stone-400">
                        « Réserver » ouvre la billetterie UGC et range la séance en <b>à confirmer</b> :
                        aucun rappel ne partira tant que tu ne l’auras pas confirmée.
                      </p>
                    </section>

                    <details className="group rounded-2xl border border-stone-200 dark:border-white/10">
                      <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-bold text-stone-500 dark:text-stone-400">
                        <span className="flex items-center gap-2">
                          <Clock3 size={14} /> Rappels · {reminders.length === 2 && reminders.includes(2_880) ? 'J-2 et 30 min' : `${reminders.length} choisi${reminders.length > 1 ? 's' : ''}`}
                        </span>
                        <ChevronDown size={15} className="transition group-open:rotate-180" />
                      </summary>
                      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                        {REMINDER_CHOICES.map(([offset, label]) => {
                          const active = reminders.includes(offset);
                          return (
                            <button
                              key={offset}
                              type="button"
                              onClick={() => toggleReminder(offset)}
                              className={`h-10 rounded-xl text-[11px] font-black transition ${active ? 'bg-bitter-lime text-charcoal' : 'bg-stone-100 text-stone-400 dark:bg-white/5 dark:text-stone-400'}`}
                            >
                              {active && <Check size={13} className="mr-1 inline" />}{label}
                            </button>
                          );
                        })}
                      </div>
                    </details>

                    {match && (
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                        <input type="checkbox" checked={alsoWatchlist} onChange={(event) => setAlsoWatchlist(event.target.checked)} className="h-4 w-4 accent-lime-500" />
                        <span className="text-xs font-bold text-charcoal dark:text-white">Ajouter aussi à ma liste « À voir »</span>
                      </label>
                    )}

                    {saveError && (
                      <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        {saveError}
                      </p>
                    )}
                  </>
                ) : (
                  /* ---------- Étape 1 : jour puis film ---------- */
                  <>
                    <section>
                      <label className={labelClass}>Quel jour ?</label>
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {programme.days.map((day) => {
                          const active = day.date === programme.date;
                          const empty = day.showings === 0;
                          return (
                            <button
                              key={day.date}
                              type="button"
                              disabled={empty}
                              onClick={() => setRequestedDate(day.date)}
                              title={empty ? 'Aucune séance ce jour-là' : `${day.films} films`}
                              className={`h-14 shrink-0 rounded-xl px-3 text-center transition ${
                                active
                                  ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal'
                                  : empty
                                    ? 'bg-stone-100 text-stone-300 dark:bg-white/5 dark:text-stone-600'
                                    : 'bg-white text-stone-500 shadow-sm dark:bg-[#191919] dark:text-stone-300'
                              }`}
                            >
                              <span className="block text-[11px] font-black capitalize">{dayLabel(day.iso)}</span>
                              <span className="mt-0.5 block text-[9px] font-bold opacity-70">
                                {empty ? '—' : `${day.films} films`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {programme.films.length === 0 ? (
                      <p className="flex items-start gap-2 py-4 text-xs font-medium text-stone-500 dark:text-stone-400">
                        <Film size={14} className="mt-0.5 shrink-0 text-stone-400" />
                        Aucune séance à venir ce jour-là. UGC ne publie la semaine suivante qu’à
                        partir du mercredi — choisis un autre jour, ou saisis la séance à la main.
                      </p>
                    ) : (
                      <>
                        <div className="relative">
                          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={`Chercher parmi ${programme.films.length} films`}
                            className={`${fieldClass} pl-11`}
                          />
                        </div>

                        <div className="space-y-1.5">
                          {films.map((entry) => (
                            <button
                              key={entry.filmId || entry.title}
                              onClick={() => {
                                haptics.soft();
                                setFilm(entry);
                              }}
                              className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 text-left transition hover:border-forest active:scale-[0.99] dark:border-white/10 dark:bg-white/5 dark:hover:border-bitter-lime"
                            >
                              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-[#252525]">
                                {entry.posterUrl ? (
                                  <img src={entry.posterUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="grid h-full w-full place-items-center"><Film size={16} className="text-stone-300 dark:text-stone-600" /></div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-charcoal dark:text-white">{entry.title}</p>
                                <p className="mt-0.5 truncate text-[11px] font-bold text-stone-400">
                                  {entry.showtimes.slice(0, 4).map((s) => timeFormatter.format(new Date(s.startsAt))).join(' · ')}
                                  {entry.showtimes.length > 4 ? ` +${entry.showtimes.length - 4}` : ''}
                                </p>
                              </div>
                              <ChevronDown size={15} className="shrink-0 -rotate-90 text-stone-300 dark:text-stone-600" />
                            </button>
                          ))}
                          {films.length === 0 && (
                            <p className="py-3 text-xs font-medium text-stone-500 dark:text-stone-400">
                              Aucun film ne correspond à « {query} » ce jour-là.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )
              ) : null}
            </>
          )}

          {/* ---------- Repli assumé ---------- */}
          <button
            onClick={onManualEntry}
            className="flex w-full items-center justify-center gap-2 border-t border-stone-200 pt-5 text-[11px] font-black uppercase tracking-wider text-stone-500 transition hover:text-charcoal dark:border-white/10 dark:text-stone-400 dark:hover:text-white"
          >
            <PenLine size={13} /> Saisir une séance à la main
          </button>
        </div>
      </section>
    </div>
  );
};

export default ScreeningProgrammePicker;
