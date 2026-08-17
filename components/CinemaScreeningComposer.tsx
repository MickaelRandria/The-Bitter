import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  Film,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { CinemaScreeningInput, TMDBSearchResult } from '../types';
import { CinemaCity, CinemaOption, searchCinemaCities, searchCinemasNearCity } from '../services/cinemaDirectory';
import { createScreening } from '../services/screenings';
import { resizeTmdbImage } from '../utils/tmdbImage';

interface CinemaScreeningComposerProps {
  profileId: string;
  initialDate?: Date;
  onClose: () => void;
  onCreated: () => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  onToast?: (message: string) => void;
}

const fieldClass =
  'h-12 w-full appearance-none rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-charcoal outline-none transition focus:border-bitter-lime focus:ring-4 focus:ring-bitter-lime/10 dark:border-white/10 dark:bg-[#191919] dark:text-white';

const labelClass = 'mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-stone-400';

const toDateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const toTimeValue = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const initialStart = (initialDate?: Date) => {
  const date = initialDate ? new Date(initialDate) : new Date(Date.now() + 2 * 60 * 60 * 1_000);
  if (initialDate) {
    date.setHours(20, 30, 0, 0);
  } else {
    date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0);
  }
  return date;
};

const datesFromToday = [
  { label: 'Ce soir', offset: 0 },
  { label: 'Demain', offset: 1 },
  { label: 'Après-demain', offset: 2 },
];

const timeOptions = ['10:30', '13:45', '16:15', '18:00', '20:15', '22:30'];
const formatOptions = ['', 'VO', 'VOSTFR', 'VF', 'IMAX', '4DX', '3D'];

const CinemaScreeningComposer: React.FC<CinemaScreeningComposerProps> = ({
  profileId,
  initialDate,
  onClose,
  onCreated,
  onAddToWatchlist,
  onToast,
}) => {
  const start = useMemo(() => initialStart(initialDate), [initialDate]);
  const [title, setTitle] = useState('');
  const [dateValue, setDateValue] = useState(toDateValue(start));
  const [timeValue, setTimeValue] = useState(toTimeValue(start));
  const [format, setFormat] = useState('');
  const [notes, setNotes] = useState('');
  const [tmdbId, setTmdbId] = useState<number | undefined>();
  const [posterUrl, setPosterUrl] = useState<string | undefined>();
  const [movieResults, setMovieResults] = useState<TMDBSearchResult[]>([]);
  const [isMovieSearching, setIsMovieSearching] = useState(false);
  const [didSearchMovie, setDidSearchMovie] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CinemaCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<CinemaCity | null>(null);
  const [cinemas, setCinemas] = useState<CinemaOption[]>([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState('');
  const [isCinemaLoading, setIsCinemaLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [reminders, setReminders] = useState<number[]>([2_880, 30]);
  const [alsoWatchlist, setAlsoWatchlist] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const selectedCinema = cinemas.find((cinema) => cinema.id === selectedCinemaId);

  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || selectedCity?.label === cityQuery) {
      setCityResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCinemaCities(query).then((result) => {
        setCityResults(result.data);
        setDirectoryError(result.error || '');
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cityQuery, selectedCity?.label]);

  const searchMovie = async () => {
    const query = title.trim();
    if (query.length < 2) return;
    setIsMovieSearching(true);
    setDidSearchMovie(true);
    try {
      const response = await fetch(
        `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(query)}&page=1`
      );
      const data = await response.json();
      setMovieResults((data.results || []).slice(0, 5));
    } catch {
      setMovieResults([]);
      onToast?.('La recherche de film ne répond pas. Tu peux garder un titre libre.');
    } finally {
      setIsMovieSearching(false);
    }
  };

  const selectMovie = (movie: TMDBSearchResult) => {
    setTmdbId(movie.id);
    setTitle(movie.title || movie.name || '');
    setPosterUrl(movie.poster_path ? `${TMDB_IMAGE_URL}${movie.poster_path}` : undefined);
    setMovieResults([]);
    setDidSearchMovie(false);
  };

  const chooseCity = async (city: CinemaCity) => {
    setSelectedCity(city);
    setCityQuery(city.label);
    setCityResults([]);
    setCinemas([]);
    setSelectedCinemaId('');
    setDirectoryError('');
    setIsCinemaLoading(true);
    try {
      const result = await searchCinemasNearCity(city);
      setCinemas(result.data);
      setSelectedCinemaId(result.data.length === 1 ? result.data[0].id : '');
      setDirectoryError(result.error || (result.data.length === 0 ? 'Aucun cinéma UGC dans cette ville.' : ''));
    } catch (error) {
      console.warn('[Cinémas] Sélection de ville interrompue', error);
      setDirectoryError('Impossible de charger les cinémas UGC de cette ville.');
    } finally {
      setIsCinemaLoading(false);
    }
  };

  const chooseDay = (offset: number) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    setDateValue(toDateValue(date));
  };

  const toggleReminder = (offset: number) => {
    setReminders((current) =>
      current.includes(offset) ? current.filter((value) => value !== offset) : [...current, offset].sort((a, b) => b - a)
    );
  };

  const save = async () => {
    const startsAt = new Date(`${dateValue}T${timeValue}`).getTime();
    if (!title.trim()) {
      setSaveError('Choisis un film ou saisis son titre.');
      return;
    }
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
      setSaveError('Choisis une séance à venir.');
      return;
    }
    if (reminders.length === 0) {
      setSaveError('Choisis au moins un rappel.');
      return;
    }
    if (!selectedCinema) {
      setSaveError('Choisis un cinéma UGC pour cette séance.');
      return;
    }

    setSaveError('');
    setIsSaving(true);
    const input: CinemaScreeningInput = {
      title,
      tmdbId,
      posterUrl,
      startsAt,
      cinemaName: selectedCinema.name,
      cinemaAddress: selectedCinema.address,
      format,
      notes,
      reminderOffsetsMinutes: reminders,
    };
    const result = await createScreening(profileId, input);
    setIsSaving(false);
    if (!result.ok) {
      setSaveError('error' in result ? result.error : 'Impossible d’enregistrer la séance.');
      return;
    }
    if (alsoWatchlist && tmdbId) onAddToWatchlist?.(tmdbId);
    onCreated();
    onToast?.('Séance planifiée. Les rappels The Bitter sont prêts.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/70 backdrop-blur-md" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">
        <header className="flex items-start justify-between border-b border-stone-200/80 px-6 pb-5 pt-6 dark:border-white/10">
          <div>
            <div className="mb-2 flex items-center gap-2 text-bitter-lime">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-bitter-lime/15"><Sparkles size={14} /></span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">The Bitter · cinéma</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">Planifier une séance</h2>
            <p className="mt-1 text-xs font-medium text-stone-500">Quelques choix, et The Bitter pense aux rappels.</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white text-stone-500 shadow-sm transition hover:text-charcoal dark:bg-white/10 dark:hover:text-white" aria-label="Fermer">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-6">
          <section>
            <label className={labelClass}>Film</label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Film size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTmdbId(undefined);
                    setPosterUrl(undefined);
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void searchMovie())}
                  placeholder="Quel film ?"
                  className={`${fieldClass} pl-11`}
                />
              </div>
              <button onClick={() => void searchMovie()} disabled={isMovieSearching || title.trim().length < 2} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-charcoal text-white transition hover:scale-[1.03] disabled:opacity-40 dark:bg-bitter-lime dark:text-charcoal" aria-label="Rechercher le film">
                {isMovieSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
            {tmdbId && <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-bitter-lime"><Check size={13} /> Fiche film sélectionnée</p>}
            {didSearchMovie && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-white/10 dark:bg-[#191919]">
                {movieResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs font-medium text-stone-500">Aucun résultat : tu peux garder ton titre librement.</p>
                ) : (
                  movieResults.map((movie) => (
                    <button key={movie.id} onClick={() => selectMovie(movie)} className="flex w-full items-center gap-3 border-b border-stone-100 px-3 py-2.5 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5">
                      <div className="h-11 w-8 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
                        {movie.poster_path && <img src={resizeTmdbImage(`${TMDB_IMAGE_URL}${movie.poster_path}`, 'w92')} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-charcoal dark:text-white">{movie.title || movie.name}</span>
                      <span className="text-[11px] font-medium text-stone-400">{(movie.release_date || movie.first_air_date || '').slice(0, 4)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          <section>
            <label className={labelClass}>Quand</label>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {datesFromToday.map((choice) => {
                const choiceDate = new Date();
                choiceDate.setHours(12, 0, 0, 0);
                choiceDate.setDate(choiceDate.getDate() + choice.offset);
                const active = dateValue === toDateValue(choiceDate);
                return <button key={choice.label} type="button" onClick={() => chooseDay(choice.offset)} className={`h-10 rounded-xl text-[11px] font-black transition ${active ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal' : 'bg-white text-stone-500 shadow-sm dark:bg-[#191919] dark:text-stone-300'}`}>{choice.label}</button>;
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="relative block">
                <CalendarDays size={15} className="pointer-events-none absolute bottom-[17px] left-4 text-stone-400" />
                <input type="date" value={dateValue} min={toDateValue(new Date())} onChange={(event) => setDateValue(event.target.value)} className={`${fieldClass} pl-10 text-[13px]`} aria-label="Date de la séance" />
              </label>
              <label className="relative block">
                <Clock3 size={15} className="pointer-events-none absolute bottom-[17px] left-4 text-stone-400" />
                <input type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} className={`${fieldClass} pl-10 text-[13px]`} aria-label="Heure de la séance" />
              </label>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
              {timeOptions.map((time) => <button key={time} type="button" onClick={() => setTimeValue(time)} className={`h-8 shrink-0 rounded-lg px-3 text-[11px] font-black transition ${timeValue === time ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal' : 'bg-white text-stone-500 shadow-sm dark:bg-[#191919] dark:text-stone-300'}`}>{time}</button>)}
            </div>
          </section>

          <section>
            <label className={labelClass}>Cinéma UGC</label>
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={cityQuery} onChange={(event) => { setCityQuery(event.target.value); setSelectedCity(null); setSelectedCinemaId(''); setCinemas([]); setDirectoryError(''); }} placeholder="Ville UGC (Lyon, Paris…)" className={`${fieldClass} pl-11`} />
            </div>
            {cityResults.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#191919]">
                {cityResults.map((city) => <button key={city.id} onClick={() => void chooseCity(city)} className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5"><span className="text-sm font-bold text-charcoal dark:text-white">{city.label}</span><span className="text-[11px] font-bold text-stone-400">UGC</span></button>)}
              </div>
            )}
            {selectedCity && (
              <div className="mt-3">
                <div className="relative">
                  <select value={selectedCinemaId} onChange={(event) => setSelectedCinemaId(event.target.value)} disabled={isCinemaLoading} className={`${fieldClass} pr-9 disabled:opacity-60`} aria-label="Choisir un cinéma UGC">
                    <option value="">{isCinemaLoading ? 'Recherche des UGC…' : cinemas.length ? 'Choisir un UGC' : 'Aucun UGC trouvé'}</option>
                    {cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}
                  </select>
                  {isCinemaLoading ? <Loader2 size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-bitter-lime" /> : <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" />}
                </div>
                {selectedCinema && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-stone-500"><MapPin size={13} className="mt-0.5 shrink-0 text-bitter-lime" />{selectedCinema.address}</p>}
              </div>
            )}
            {directoryError && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{directoryError}</p>}
          </section>

          <section className="grid grid-cols-[1fr_auto] items-end gap-3">
            <label className="block"><span className={labelClass}>Format</span><div className="relative"><select value={format} onChange={(event) => setFormat(event.target.value)} className={`${fieldClass} pr-9`}><option value="">Standard</option>{formatOptions.slice(1).map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" /></div></label>
            <div className="pb-0.5 text-right text-[11px] font-bold text-stone-400">Facultatif</div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-[#191919]">
            <div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-bitter-lime/15 text-bitter-lime"><Clock3 size={14} /></span><div><p className="text-xs font-black text-charcoal dark:text-white">Rappels The Bitter</p><p className="text-[11px] font-medium text-stone-500">Choisis ce qui te convient.</p></div></div>
            <div className="grid grid-cols-3 gap-2">
              {[[2880, 'J-2'], [120, '2 h'], [30, '30 min']].map(([offset, label]) => { const active = reminders.includes(offset as number); return <button key={String(offset)} type="button" onClick={() => toggleReminder(offset as number)} className={`h-10 rounded-xl text-[11px] font-black transition ${active ? 'bg-bitter-lime text-charcoal' : 'bg-stone-100 text-stone-400 dark:bg-white/5 dark:text-stone-400'}`}>{active && <Check size={13} className="mr-1 inline" />}{label}</button>; })}
            </div>
          </section>

          {tmdbId && <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-[#191919]"><input type="checkbox" checked={alsoWatchlist} onChange={(event) => setAlsoWatchlist(event.target.checked)} className="h-4 w-4 accent-lime-500" /><span className="text-xs font-bold text-charcoal dark:text-white">Ajouter aussi à ma liste « À voir »</span></label>}

          <details className="group rounded-2xl border border-stone-200 dark:border-white/10"><summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-bold text-stone-500">Ajouter une note <ChevronDown size={15} className="transition group-open:rotate-180" /></summary><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Avec qui, place réservée…" className="mb-4 mx-4 block w-[calc(100%-2rem)] resize-none rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-medium text-charcoal outline-none focus:border-bitter-lime dark:border-white/10 dark:bg-[#191919] dark:text-white" /></details>

          {saveError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">{saveError}</p>}

          <button onClick={() => void save()} disabled={isSaving} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-charcoal text-[11px] font-black uppercase tracking-[0.15em] text-white transition hover:scale-[1.01] disabled:opacity-50 dark:bg-bitter-lime dark:text-charcoal">
            {isSaving ? <Loader2 size={17} className="animate-spin" /> : <CalendarPlus size={17} />}{isSaving ? 'Planification…' : 'Planifier la séance'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default CinemaScreeningComposer;
