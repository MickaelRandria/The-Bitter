import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CinemaScreening, Movie } from '../types';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { useLanguage } from '../contexts/LanguageContext';
import CinemaScreeningComposer from './CinemaScreeningComposer';
import { deleteScreening, listUpcomingScreenings } from '../services/screenings';
import { enablePushNotifications, isLikelyInstalledPwa, testPushNotification } from '../services/pushNotifications';
import {
  BellRing,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Film,
  MapPin,
  Star,
  X,
  LayoutGrid,
  CalendarDays,
  Flame,
  Trash2,
} from 'lucide-react';

const WeeklyRecapStory = lazy(() => import('./WeeklyRecapStory'));

interface CalendarViewProps {
  movies: Movie[];
  profileId?: string;
  onAddToWatchlist?: (tmdbId: number) => void;
  onToast?: (message: string) => void;
}

interface CalendarItem {
  type: 'watched' | 'planned';
  movie?: Movie;
  screening?: CinemaScreening;
}

/**
 * Noms de jours et de mois dérivés de la langue active (le calendrier était
 * entièrement codé en français, y compris pour un utilisateur en anglais).
 * Le 1er janvier 2024 est un lundi : la semaine reste bien lundi → dimanche.
 */
const buildCalendarLabels = (locale: string) => ({
  days: Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i))
  ),
  months: Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, i, 1))
  ),
  monthsShort: Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2024, i, 1)).replace('.', '')
  ),
});

const DayDetailModal: React.FC<{
  day: number;
  monthName: string;
  items: CalendarItem[];
  onClose: () => void;
  onRemoveScreening: (screening: CinemaScreening) => void;
}> = ({ day, monthName, items, onClose, onRemoveScreening }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 transition-colors">
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl dark:shadow-black/60 relative z-10 max-h-[80vh] flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] border border-sand dark:border-white/10 transition-all">
        <div className="flex justify-between items-center p-6 border-b border-sand dark:border-white/10 transition-colors">
          <div>
            <h3 className="text-3xl font-black text-charcoal dark:text-white tracking-tight leading-none">
              {day} {monthName}
            </h3>
            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest mt-1">
              {items.length} films
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:bg-stone-200 transition-all active:scale-90"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 no-scrollbar">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex gap-4 p-3 rounded-2xl bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 items-start transition-colors"
            >
              <div className="w-16 h-24 rounded-xl overflow-hidden shadow-sm shrink-0 bg-stone-200 dark:bg-[#252525] border dark:border-white/5 transition-colors">
                {(item.movie?.posterUrl || item.screening?.posterUrl) ? (
                  <img
                    src={resizeTmdbImage(item.movie?.posterUrl || item.screening?.posterUrl || '', 'w185')}
                    className="w-full h-full object-cover"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={20} className="text-stone-300 dark:text-stone-700" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 py-1">
                <h4 className="font-black text-sm text-charcoal dark:text-white leading-tight mb-1">
                  {item.movie?.title || item.screening?.title}
                </h4>
                {item.type === 'planned' && item.screening ? (
                  <>
                    <p className="text-[10px] font-bold text-bitter-lime mb-2 capitalize">
                      {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.screening.startsAt))}
                      {item.screening.format ? ` · ${item.screening.format}` : ''}
                    </p>
                    {item.screening.cinemaName && (
                      <p className="flex items-center gap-1 text-[10px] font-bold text-stone-400 dark:text-stone-400 truncate"><MapPin size={11} />{item.screening.cinemaName}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveScreening(item.screening!)}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[10px] font-black text-stone-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-stone-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                      aria-label={`Retirer ${item.screening.title} du calendrier`}
                    >
                      <Trash2 size={12} /> Retirer
                    </button>
                  </>
                ) : item.movie ? (
                  <>
                    <p className="text-[10px] font-bold text-stone-400 dark:text-stone-400 mb-2 truncate">{item.movie.director}</p>
                    <div className="flex items-center gap-2">
                      <div className="bg-charcoal dark:bg-forest text-white px-2 py-1 rounded-lg flex items-center gap-1">
                        <Star size={10} fill="currentColor" className="text-tz-yellow" />
                        <span className="text-[10px] font-bold">{((item.movie.ratings.story + item.movie.ratings.visuals + item.movie.ratings.acting + item.movie.ratings.sound) / 4).toFixed(1)}</span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CalendarView: React.FC<CalendarViewProps> = ({ movies, profileId, onAddToWatchlist, onToast }) => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const { days: DAYS, months: MONTHS, monthsShort: MONTHS_SHORT } = useMemo(
    () => buildCalendarLabels(locale),
    [locale]
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ day: number; items: CalendarItem[] } | null>(
    null
  );
  const [viewMode, setViewMode] = useState<'month' | 'heatmap'>('month');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [screenings, setScreenings] = useState<CinemaScreening[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [showPushEducation, setShowPushEducation] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushActivationError, setPushActivationError] = useState('');
  const [screeningToDelete, setScreeningToDelete] = useState<CinemaScreening | null>(null);
  const [isDeletingScreening, setIsDeletingScreening] = useState(false);
  const [deleteScreeningError, setDeleteScreeningError] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const refreshScreenings = async () => {
    if (!profileId) {
      setScreenings([]);
      return;
    }
    setScreenings(await listUpcomingScreenings(profileId));
  };

  useEffect(() => {
    void refreshScreenings();
    // profileId change uniquement : recharger à chaque rendu créerait une boucle
    // puisque la réponse met à jour l'état local des séances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const handleEnablePush = async () => {
    if (!profileId) {
      onToast?.('Connecte-toi pour activer les rappels de séances.');
      return;
    }
    if (!isLikelyInstalledPwa()) {
      setPushActivationError('Sur iPhone, ajoute d’abord The Bitter à l’écran d’accueil pour recevoir les rappels.');
      return;
    }
    setPushActivationError('');
    setIsEnablingPush(true);
    const result = await enablePushNotifications();
    if (!result.ok) {
      setIsEnablingPush(false);
      setPushActivationError('message' in result ? result.message : 'Impossible d’activer les rappels.');
      return;
    }
    const test = await testPushNotification();
    setIsEnablingPush(false);
    setShowPushEducation(false);
    onToast?.(test.ok ? 'Rappels activés : une notification de test vient d’être envoyée.' : ('message' in test ? test.message : 'Impossible d’envoyer la notification de test.'));
  };

  const openPushEducation = () => {
    if (!profileId) {
      onToast?.('Connecte-toi pour activer les rappels de séances.');
      return;
    }
    setPushActivationError('');
    setShowPushEducation(true);
  };

  const confirmScreeningDeletion = async () => {
    if (!screeningToDelete) return;
    setDeleteScreeningError('');
    setIsDeletingScreening(true);
    const result = await deleteScreening(screeningToDelete.id);
    setIsDeletingScreening(false);
    if (!result.ok) {
      setDeleteScreeningError('error' in result ? result.error : 'Impossible de retirer cette séance.');
      return;
    }

    setScreenings((current) => current.filter((screening) => screening.id !== screeningToDelete.id));
    setSelectedDay((current) => {
      if (!current) return null;
      const items = current.items.filter((item) => item.screening?.id !== screeningToDelete.id);
      return items.length ? { ...current, items } : null;
    });
    setScreeningToDelete(null);
    onToast?.('Séance retirée : ses rappels ont été annulés.');
  };

  // --- Streak calculation (weekly: at least 1 movie per week) ---
  const streakData = useMemo(() => {
    // Get Monday of a given date (week start)
    const getWeekStart = (d: Date): number => {
      const copy = new Date(d);
      const day = copy.getDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day; // shift to Monday
      copy.setHours(0, 0, 0, 0);
      copy.setDate(copy.getDate() + diff);
      return copy.getTime();
    };

    const watchedMovies = movies.filter((m) => m.status === 'watched' && m.dateWatched);
    const weekSet = new Set(watchedMovies.map((m) => getWeekStart(new Date(m.dateWatched!))));

    const today = new Date();
    const thisWeek = getWeekStart(today);
    const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000;

    // Current streak: count consecutive weeks backward from this or last week
    let currentStreak = 0;
    const startWeek = weekSet.has(thisWeek) ? thisWeek : weekSet.has(lastWeek) ? lastWeek : null;
    if (startWeek !== null) {
      let cursor = startWeek;
      while (weekSet.has(cursor)) {
        currentStreak++;
        cursor -= 7 * 24 * 60 * 60 * 1000;
      }
    }

    // Best streak: sort all unique week starts and find longest consecutive run
    const sortedWeeks = (Array.from(weekSet) as number[]).sort((a, b) => a - b);
    let bestStreak = 0;
    let runStreak = sortedWeeks.length > 0 ? 1 : 0;
    for (let i = 1; i < sortedWeeks.length; i++) {
      const diff = (sortedWeeks[i] - sortedWeeks[i - 1]) / (1000 * 60 * 60 * 24 * 7);
      if (diff === 1) {
        runStreak++;
      } else {
        bestStreak = Math.max(bestStreak, runStreak);
        runStreak = 1;
      }
    }
    bestStreak = Math.max(bestStreak, runStreak);

    return { currentStreak, bestStreak };
  }, [movies]);

  const recapMovies = useMemo(
    () => movies.filter((movie) => movie.status === 'watched' && movie.dateWatched),
    [movies]
  );

  // --- Year heatmap data ---
  const yearData = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    movies
      .filter((m) => m.status === 'watched' && m.dateWatched)
      .forEach((m) => {
        const d = new Date(m.dateWatched!);
        if (d.getFullYear() === year) {
          counts[d.getMonth()]++;
        }
      });
    return counts;
  }, [movies, year]);

  // --- Monthly data with optional genre filter ---
  const monthData = useMemo(() => {
    const daysMap: Record<number, CalendarItem[]> = {};
    let watchedCount = 0;
    let plannedCount = 0;
    const genresInMonth = new Set<string>();

    movies
      .filter((m) => m.status === 'watched')
      .forEach((m) => {
        if (m.dateWatched) {
          const d = new Date(m.dateWatched);
          if (d.getMonth() === month && d.getFullYear() === year) {
            if (m.genre) genresInMonth.add(m.genre);
            if (selectedGenre && m.genre !== selectedGenre) return;
            const day = d.getDate();
            if (!daysMap[day]) daysMap[day] = [];
            daysMap[day].push({ movie: m, type: 'watched' });
            watchedCount++;
          }
        }
      });

    screenings
      .filter((screening) => screening.status === 'scheduled')
      .forEach((screening) => {
        const date = new Date(screening.startsAt);
        if (date.getMonth() !== month || date.getFullYear() !== year) return;
        const day = date.getDate();
        if (!daysMap[day]) daysMap[day] = [];
        daysMap[day].push({ screening, type: 'planned' });
        plannedCount++;
      });

    return { daysMap, watchedCount, plannedCount, genres: Array.from(genresInMonth).sort() };
  }, [movies, screenings, month, year, selectedGenre]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const heatmapColor = (count: number) => {
    if (count === 0) return 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-600';
    if (count <= 2) return 'bg-lime-100 dark:bg-lime-950 text-lime-600 dark:text-lime-400';
    if (count <= 4) return 'bg-lime-300 dark:bg-lime-800 text-lime-800 dark:text-lime-200';
    return 'bg-forest dark:bg-bitter-lime text-white dark:text-charcoal';
  };

  const navigateToMonth = (m: number) => {
    setCurrentDate(new Date(year, m, 1));
    setViewMode('month');
  };

  return (
    <div className="animate-[fadeIn_0.4s_ease-out] bg-transparent -mx-6 -mt-4">
      <header className="mx-auto max-w-md px-6 pb-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">
              {viewMode === 'month' ? `${MONTHS[month]} ${year}` : year}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-500">
              {viewMode === 'month' ? (
                <>
                  <span>{t('calendar.screenings', { count: String(monthData.watchedCount), s: monthData.watchedCount > 1 ? 's' : '' })}</span>
                  {monthData.plannedCount > 0 && <span>· {t('calendar.planned', { count: String(monthData.plannedCount), s: monthData.plannedCount > 1 ? 's' : '' })}</span>}
                  {streakData.bestStreak > 0 && (
                    <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                      <Flame size={11} className={streakData.currentStreak > 0 ? 'text-orange-400' : 'text-stone-300 dark:text-stone-600'} />
                      {streakData.currentStreak}
                    </span>
                  )}
                </>
              ) : (
                <span>{yearData.reduce((a, b) => a + b, 0)} séances</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              data-tour="calendar-toggle"
              onClick={() => setViewMode((v) => (v === 'month' ? 'heatmap' : 'month'))}
              className="grid h-9 w-9 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-charcoal dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={viewMode === 'month' ? t('calendar.yearView') : t('calendar.monthView')}
              title={viewMode === 'month' ? t('calendar.yearView') : t('calendar.monthView')}
            >
              {viewMode === 'month' ? <LayoutGrid size={17} /> : <CalendarDays size={17} />}
            </button>
            <button
              onClick={openPushEducation}
              disabled={isEnablingPush}
              className="grid h-9 w-9 place-items-center rounded-full text-bitter-lime transition hover:bg-bitter-lime/10 disabled:opacity-50"
              aria-label="Activer les rappels push"
              title="Activer les rappels"
            >
              <BellRing size={17} className={isEnablingPush ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>

        <div data-tour="calendar-nav" className="mt-5 flex items-center justify-between border-t border-stone-200/70 pt-3 dark:border-white/10">
          <button
            onClick={() => setCurrentDate(viewMode === 'month' ? new Date(year, month - 1, 1) : new Date(year - 1, month, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-charcoal transition hover:bg-stone-100 active:scale-90 dark:text-white dark:hover:bg-white/10"
            aria-label={viewMode === 'month' ? 'Mois précédent' : 'Année précédente'}
          >
            <ChevronLeft size={19} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              setCurrentDate(new Date());
              setViewMode('month');
            }}
            className="text-[10px] font-black uppercase tracking-[0.15em] text-stone-400 transition hover:text-charcoal dark:text-stone-500 dark:hover:text-white"
          >
            Aujourd’hui
          </button>
          <button
            onClick={() => setCurrentDate(viewMode === 'month' ? new Date(year, month + 1, 1) : new Date(year + 1, month, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-charcoal transition hover:bg-stone-100 active:scale-90 dark:text-white dark:hover:bg-white/10"
            aria-label={viewMode === 'month' ? 'Mois suivant' : 'Année suivante'}
          >
            <ChevronRight size={19} strokeWidth={2.5} />
          </button>
        </div>

        <button
          onClick={() =>
            profileId
              ? setShowComposer(true)
              : onToast?.('Connecte-toi pour planifier une séance et recevoir ses rappels.')
          }
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-charcoal px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:scale-[1.02] active:scale-95 dark:bg-bitter-lime dark:text-charcoal"
        >
          <CalendarPlus size={14} /> Planifier une séance
        </button>
      </header>

      {viewMode === 'month' && recapMovies.length > 0 && (
        <div className="mx-auto max-w-md px-6 pb-5">
          <Suspense fallback={<div className="h-28 animate-pulse rounded-[1.7rem] bg-stone-200/70 dark:bg-white/5" />}>
            <WeeklyRecapStory movies={recapMovies} variant="calendar" />
          </Suspense>
        </div>
      )}

      {viewMode === 'heatmap' ? (
        /* Annual heatmap: 4×3 grid */
        <div className="px-6 pb-6">
          <div className="grid grid-cols-4 gap-3">
            {MONTHS_SHORT.map((label, i) => {
              const count = yearData[i];
              const isCurrentMonth =
                i === new Date().getMonth() && year === new Date().getFullYear();
              return (
                <button
                  key={i}
                  onClick={() => navigateToMonth(i)}
                  className={`rounded-2xl p-3 flex flex-col items-center gap-1 transition-all active:scale-95 ${heatmapColor(count)} ${isCurrentMonth ? 'ring-2 ring-forest dark:ring-bitter-lime ring-offset-1 dark:ring-offset-[#161616]' : ''}`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
                    {label}
                  </span>
                  <span className="text-lg font-black leading-none">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Monthly grid */
        <div className="px-6">
          {/* Un seul filtre compact, plutôt qu'une rangée de boutons. */}
          {monthData.genres.length > 0 && (
            <div className="mb-4 flex items-center justify-between border-b border-stone-200/70 pb-3 dark:border-white/10">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">Filtrer</span>
              <select
                value={selectedGenre ?? ''}
                onChange={(event) => setSelectedGenre(event.target.value || null)}
                className="max-w-[11rem] bg-transparent text-right text-[11px] font-bold text-charcoal outline-none dark:text-white"
                aria-label="Filtrer les films par genre"
              >
                <option value="">Tous les genres</option>
                {monthData.genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-7 mb-3">
            {/* clé sur l'index : DAYS contient deux « M » (mardi/mercredi) */}
            {DAYS.map((day, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-black text-stone-300 dark:text-stone-600 opacity-50 dark:opacity-100"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const items = monthData.daysMap[day] || [];
              const hasItems = items.length > 0;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;
              return (
                <button
                  key={day}
                  onClick={() => hasItems && setSelectedDay({ day, items })}
                  disabled={!hasItems}
                  className={`relative aspect-square flex flex-col items-center justify-center transition-all rounded-xl ${hasItems ? 'active:scale-95' : ''}`}
                >
                  {hasItems ? (
                    <div className="w-full h-full p-0.5 relative">
                      {items.length > 1 && (
                        <div className="absolute inset-0 bg-white dark:bg-[#1a1a1a] rounded-xl border border-stone-200 dark:border-white/5 shadow-sm dark:shadow-black/20 translate-x-[2px] translate-y-[2px] -z-10" />
                      )}
                      {(items[0].movie?.posterUrl || items[0].screening?.posterUrl) ? (
                        <img
                          src={resizeTmdbImage(items[0].movie?.posterUrl || items[0].screening?.posterUrl || '', 'w154')}
                          className="w-full h-full object-cover rounded-xl shadow-md transition-shadow"
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center rounded-xl shadow-md transition-colors ${items[0].type === 'planned' ? 'bg-bitter-lime text-charcoal' : 'bg-charcoal dark:bg-forest text-white'}`}>
                          {items[0].type === 'planned' ? <CalendarPlus size={16} /> : <Film size={16} className="opacity-20" />}
                        </div>
                      )}
                      {items.length > 1 && (
                        <div className="absolute top-1 right-1 bg-charcoal dark:bg-forest text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-20 shadow-sm border border-white/20 dark:border-white/5">
                          +{items.length - 1}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-sm font-semibold transition-colors ${isToday ? 'text-forest dark:text-lime-500 bg-forest/10 dark:bg-lime-500/10 w-8 h-8 flex items-center justify-center rounded-full' : 'text-stone-300 dark:text-stone-600'}`}
                    >
                      {day}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showComposer && profileId && (
        <CinemaScreeningComposer
          profileId={profileId}
          onClose={() => setShowComposer(false)}
          onCreated={() => void refreshScreenings()}
          onAddToWatchlist={onAddToWatchlist}
          onToast={onToast}
        />
      )}

      {showPushEducation && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
          <button
            className="absolute inset-0 bg-charcoal/70 backdrop-blur-md"
            onClick={() => !isEnablingPush && setShowPushEducation(false)}
            aria-label="Fermer"
          />
          <section className="relative z-10 w-full max-w-sm rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] px-6 pb-7 pt-8 text-center shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">
            <button
              onClick={() => setShowPushEducation(false)}
              disabled={isEnablingPush}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white text-stone-500 shadow-sm transition hover:text-charcoal disabled:opacity-40 dark:bg-white/10 dark:hover:text-white"
              aria-label="Fermer"
            >
              <X size={17} />
            </button>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.35rem] bg-bitter-lime text-charcoal shadow-lg shadow-bitter-lime/20">
              <BellRing size={28} strokeWidth={2.3} />
            </div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-bitter-lime">Rappels The Bitter</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-charcoal dark:text-white">Ne rate plus ta séance</h2>
            <p className="mx-auto mt-3 max-w-[17rem] text-sm font-medium leading-relaxed text-stone-500">
              Reçois seulement les rappels des séances que tu planifies : J-2, 2 h ou 30 min avant.
            </p>
            <p className="mt-3 text-[11px] font-bold text-stone-400">Aucune publicité. Tu peux les couper à tout moment dans les réglages de ton iPhone.</p>
            {pushActivationError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-left text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">{pushActivationError}</p>}
            <button
              onClick={() => void handleEnablePush()}
              disabled={isEnablingPush}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-charcoal text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:scale-[1.01] disabled:opacity-50 dark:bg-bitter-lime dark:text-charcoal"
            >
              <BellRing size={16} className={isEnablingPush ? 'animate-pulse' : ''} />
              {isEnablingPush ? 'Activation…' : 'Activer les rappels'}
            </button>
            <button
              onClick={() => setShowPushEducation(false)}
              disabled={isEnablingPush}
              className="mt-3 text-xs font-black text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-charcoal disabled:opacity-40 dark:text-stone-400 dark:hover:text-white"
            >
              Pas maintenant
            </button>
          </section>
        </div>
      )}

      {selectedDay && (
        <DayDetailModal
          day={selectedDay.day}
          monthName={MONTHS[month]}
          items={selectedDay.items}
          onClose={() => setSelectedDay(null)}
          onRemoveScreening={(screening) => {
            setDeleteScreeningError('');
            setScreeningToDelete(screening);
          }}
        />
      )}

      {screeningToDelete && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
          <button
            className="absolute inset-0 bg-charcoal/70 backdrop-blur-md"
            onClick={() => !isDeletingScreening && setScreeningToDelete(null)}
            aria-label="Annuler"
          />
          <section className="relative z-10 w-full max-w-sm rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] px-6 pb-7 pt-8 shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
              <Trash2 size={21} />
            </div>
            <h2 className="mt-5 text-2xl font-black tracking-tight text-charcoal dark:text-white">Retirer cette séance ?</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-stone-500">
              « {screeningToDelete.title} » disparaîtra de ton calendrier et ses rappels seront annulés.
            </p>
            {deleteScreeningError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">{deleteScreeningError}</p>}
            <button
              onClick={() => void confirmScreeningDeletion()}
              disabled={isDeletingScreening}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:scale-[1.01] disabled:opacity-50"
            >
              <Trash2 size={16} /> {isDeletingScreening ? 'Suppression…' : 'Retirer la séance'}
            </button>
            <button
              onClick={() => setScreeningToDelete(null)}
              disabled={isDeletingScreening}
              className="mt-3 w-full text-xs font-black text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-charcoal disabled:opacity-40 dark:text-stone-400 dark:hover:text-white"
            >
              Garder la séance
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
