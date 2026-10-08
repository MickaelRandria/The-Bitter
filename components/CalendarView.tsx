import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  CinemaProgrammeFilm,
  CinemaScreening,
  CinemaShowtime,
  CinemaSubscription,
  FavoriteCinema,
  Movie,
} from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { acceptSlot, cancelPlan } from '../services/plans';
import { confirmScreening, createScreening, deleteScreening } from '../services/screenings';
import { enablePushNotifications, hasPushSubscription } from '../services/pushNotifications';
import {
  AgendaEvent,
  CALENDAR_FILTERS,
  CalendarFilter,
  calendarDay,
  filterCalendarDays,
} from '../utils/calendarAgenda';
import { useCalendarAgenda } from './useCalendarAgenda';
import CalendarMonth from './CalendarMonth';
import CalendarUpcoming from './CalendarUpcoming';
import CalendarYear from './CalendarYear';
import CalendarDaySheet from './CalendarDaySheet';
import { agendaAction, agendaGhost, CalendarActions, eventColors } from './CalendarEventCard';
import CinemaScreeningComposer from './CinemaScreeningComposer';
import ScreeningProgrammePicker from './ScreeningProgrammePicker';
import UpcomingReleasesFrise from './UpcomingReleasesFrise';

const WeeklyRecapStory = lazy(() => import('./WeeklyRecapStory'));
interface CalendarViewProps {
  movies: Movie[];
  profileId?: string;
  favoriteCinema?: FavoriteCinema;
  subscription?: CinemaSubscription;
  onAddToWatchlist?: (tmdbId: number) => Promise<boolean>;
  onRewatch?: (movie: Movie) => void;
  onReview?: (movie: Movie) => void;
  onAddWatched?: (day: string) => void;
  /** « Bientôt en salle » : ouvrir un film, le voir avec quelqu'un. */
  onPreviewMovie?: (tmdbId: number) => void;
  onWatchWith?: (tmdbId: number) => void;
  onToast?: (message: string) => void;
}

export default function CalendarView(props: CalendarViewProps) {
  const { movies, profileId, favoriteCinema, onToast } = props;
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const [today, setToday] = useState(() => calendarDay(Date.now()));
  const [currentMonth, setCurrentMonth] = useState(() => calendarDay(Date.now()).slice(0, 7));
  const [tab, setTab] = useState<'month' | 'upcoming' | 'year'>('month');
  const [day, setDay] = useState<string | null>(null);
  const [genre, setGenre] = useState('');
  /** Le filtre choisi, gardé sur l'appareil : on revient souvent au même. */
  const [filter, setFilter] = useState<CalendarFilter>(() => {
    try {
      const saved = localStorage.getItem('bitter_calendar_filter') as CalendarFilter | null;
      return saved && CALENDAR_FILTERS.includes(saved) ? saved : 'all';
    } catch {
      return 'all';
    }
  });
  const chooseFilter = (next: CalendarFilter) => {
    setFilter(next);
    try {
      localStorage.setItem('bitter_calendar_filter', next);
    } catch {
      /* Le choix vaut pour la session. */
    }
  };
  const [composer, setComposer] = useState<{ mode: 'programme' | 'manual'; day: string } | null>(
    null
  );
  const [busyId, setBusyId] = useState('');
  const busy = useRef(false);
  const [reminderActive, setReminderActive] = useState(false);
  const [declined, setDeclined] = useState<string[]>([]);
  const unavailableKey = `bitter_calendar_unavailable_v1_${profileId ?? 'local'}`;
  const agenda = useCalendarAgenda(movies, profileId, language, today);
  const year = Number(currentMonth.slice(0, 4));
  const month = Number(currentMonth.slice(5)) - 1;
  useEffect(() => {
    const timer = window.setInterval(() => setToday(calendarDay(Date.now())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void hasPushSubscription().then((active) => {
      if (!cancelled) setReminderActive(active);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(unavailableKey) ?? '[]');
      setDeclined(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
    } catch {
      setDeclined([]);
    }
  }, [unavailableKey]);
  const days = useMemo(
    () =>
      new Map(
        [...agenda.days].map(([date, events]) => [
          date,
          events.map((event) => ({ ...event, declined: declined.includes(event.id) })),
        ])
      ),
    [agenda.days, declined]
  );
  const visibleDays = useMemo(() => {
    const filtered = filterCalendarDays(days, filter);
    if (!genre) return filtered;
    const ids = new Set(movies.filter((movie) => movie.genre === genre).map((movie) => movie.id));
    return new Map(
      [...filtered].map(([date, events]) => [
        date,
        events.filter((event) => event.kind !== 'watched' || ids.has(event.movieId ?? '')),
      ])
    );
  }, [days, movies, genre, filter]);
  /** « À venir » n'a pas de films vus : le filtre « Vus » y vaut « Tout ». */
  const upcomingFilter: CalendarFilter = filter === 'watched' ? 'all' : filter;
  const watchlistIds = useMemo(
    () =>
      new Set(
        movies
          .filter(
            (movie) => movie.status === 'watchlist' && movie.mediaType !== 'tv' && movie.tmdbId
          )
          .map((movie) => movie.tmdbId!)
      ),
    [movies]
  );
  const genres = useMemo(
    () =>
      [
        ...new Set(
          movies
            .filter(
              (movie) => movie.status === 'watched' && movie.mediaType !== 'tv' && movie.genre
            )
            .map((movie) => movie.genre)
        ),
      ].sort(),
    [movies]
  );

  /** Un verrou immédiat évite deux insertions si deux touchers arrivent avant le rendu. */
  const run = async (id: string, action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(id);
    try {
      await action();
    } catch {
      onToast?.(t('agenda.actionError'));
    } finally {
      busy.current = false;
      setBusyId('');
    }
  };
  const plan = (date: string) => {
    if (!profileId) {
      onToast?.(t('agenda.loginSessions'));
      return;
    }
    setDay(null);
    setComposer({ mode: favoriteCinema ? 'programme' : 'manual', day: date });
  };
  const remind = () =>
    void run('reminder', async () => {
      if (!profileId) {
        onToast?.(t('agenda.loginReminders'));
        return;
      }
      if (reminderActive) {
        onToast?.(t('agenda.releaseReminderEnabled'));
        return;
      }
      const result = await enablePushNotifications();
      if (result.ok) {
        setReminderActive(true);
        onToast?.(t('agenda.releaseReminderEnabled'));
      } else onToast?.(t('agenda.pushUnavailable'));
    });
  const actions: CalendarActions = {
    today,
    busyId,
    reminderActive,
    onOpenDay: setDay,
    onPlan: plan,
    onRemind: remind,
    onRemove: (event) => {
      if (event.kind === 'screening') {
        const screening = agenda.screenings.find((s) => s.id === event.screeningId);
        if (screening) remove(screening);
        return;
      }
      if (event.kind !== 'plan' || !event.planId) return;
      if (!window.confirm(t('agenda.cancelConfirmation', { title: event.title }))) return;
      void run(event.id, async () => {
        const result = await cancelPlan(event.planId!);
        if (!result.ok) {
          onToast?.(t('agenda.removeError'));
          return;
        }
        agenda.refresh();
        onToast?.(t('agenda.sessionCancelled'));
      });
    },
    onAccept: (event) =>
      void run(event.id, async () => {
        if (!event.slotId) return;
        const result = await acceptSlot(event.slotId);
        if (!result.ok) {
          onToast?.(t('agenda.acceptError'));
          return;
        }
        agenda.refresh();
        onToast?.(t('agenda.accepted'));
      }),
    onDecline: (event: AgendaEvent) => {
      const next = declined.includes(event.id)
        ? declined.filter((id) => id !== event.id)
        : [...declined, event.id];
      setDeclined(next);
      try {
        localStorage.setItem(unavailableKey, JSON.stringify(next));
      } catch {
        /* Le choix reste valable pour la session en cours. */
      }
      onToast?.(t('agenda.unavailableLocal'));
    },
    onAdd: (id) =>
      void run(`add:${id}`, async () => {
        if (!props.onAddToWatchlist) return;
        const ok = await props.onAddToWatchlist(id);
        if (!ok) onToast?.(t('agenda.addError'));
      }),
  };
  const showtime = (film: CinemaProgrammeFilm, showing: CinemaShowtime) =>
    void run(`showtime:${showing.id}`, async () => {
      if (!profileId || !favoriteCinema) {
        onToast?.(t('agenda.loginSessions'));
        return;
      }
      if (showing.startsAt <= Date.now()) {
        onToast?.(t('agenda.showtimePast'));
        return;
      }
      const normal = (title: string) =>
        title
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      const known = movies.find(
        (movie) => movie.mediaType !== 'tv' && normal(movie.title) === normal(film.title)
      );
      const result = await createScreening(profileId, {
        title: film.title,
        tmdbId: known?.tmdbId,
        posterUrl: known?.posterUrl ?? film.posterUrl,
        startsAt: showing.startsAt,
        cinemaName: favoriteCinema.name,
        format: showing.version,
        reminderOffsetsMinutes: [30],
        bookingUrl: showing.bookingUrl,
      });
      if (!result.ok) {
        onToast?.(t('agenda.saveError'));
        return;
      }
      agenda.refresh();
      onToast?.(t('agenda.sessionCreated', { title: film.title }));
    });
  const remove = (screening: CinemaScreening) => {
    if (!window.confirm(t('agenda.deleteConfirmation', { title: screening.title }))) return;
    void run(`screening:${screening.id}`, async () => {
      const result = await deleteScreening(screening.id);
      if (!result.ok) {
        onToast?.(t('agenda.removeError'));
        return;
      }
      agenda.refresh();
      onToast?.(t('agenda.sessionRemoved'));
    });
  };
  const confirm = (screening: CinemaScreening) =>
    void run(`screening:${screening.id}`, async () => {
      const result = await confirmScreening(screening.id);
      if (!result.ok) {
        onToast?.(t('agenda.saveError'));
        return;
      }
      agenda.refresh();
      onToast?.(t('agenda.sessionConfirmed'));
    });
  const navigate = (offset: number) => {
    const date = new Date(Date.UTC(year, month + (tab === 'year' ? 0 : offset), 1));
    if (tab === 'year') date.setUTCFullYear(year + offset);
    setCurrentMonth(date.toISOString().slice(0, 7));
  };
  const monthEvents = [...days]
    .filter(([date]) => date.startsWith(currentMonth))
    .flatMap(([, events]) => events);
  const subtitle =
    tab === 'month'
      ? t('agenda.monthSummary', {
          watched: agenda.history.filter((watch) => watch.day.startsWith(currentMonth)).length,
          sessions: monthEvents.filter((event) => ['screening', 'plan'].includes(event.kind))
            .length,
          releases: monthEvents.filter((event) =>
            ['release', 'watchlist-release'].includes(event.kind)
          ).length,
        })
      : t('agenda.nextMonths');
  return (
    <div className="mx-auto w-full max-w-lg pb-28 pt-7 text-charcoal dark:text-white">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[27px] font-black capitalize leading-tight tracking-[-.04em]">
            {tab === 'upcoming'
              ? t('agenda.upcoming')
              : tab === 'year'
                ? year
                : new Intl.DateTimeFormat(locale, {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Europe/Paris',
                  }).format(new Date(`${currentMonth}-01T12:00:00Z`))}
          </h1>
          {tab !== 'year' && (
            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-stone-500">
              {subtitle}
            </p>
          )}
        </div>
        {tab !== 'upcoming' && (
          <div data-tour="calendar-nav" className="flex shrink-0">
            <button
              className="grid h-10 w-9 place-items-center"
              onClick={() => navigate(-1)}
              aria-label={t('agenda.previous')}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="grid h-10 w-9 place-items-center"
              onClick={() => navigate(1)}
              aria-label={t('agenda.next')}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        )}
      </header>
      <div
        data-tour="calendar-toggle"
        role="tablist"
        aria-label={t('agenda.views')}
        className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-stone-200/70 p-1 dark:bg-[#1A1A19]"
      >
        {(['month', 'upcoming', 'year'] as const).map((mode) => (
          <button
            key={mode}
            role="tab"
            aria-selected={mode === tab}
            aria-controls={`calendar-panel-${mode}`}
            id={`calendar-tab-${mode}`}
            onClick={() => setTab(mode)}
            className={`min-h-9 rounded-full px-2 text-[10px] font-black uppercase tracking-widest ${mode === tab ? 'bg-[#D9FF00] text-[#111]' : 'text-stone-500 dark:text-stone-400'}`}
          >
            {t(`agenda.${mode}`)}
          </button>
        ))}
      </div>
      {tab !== 'year' && (
        <div
          role="radiogroup"
          aria-label={t('agenda.filterLabel')}
          className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CALENDAR_FILTERS.filter((f) => tab === 'month' || f !== 'watched').map((f) => {
            const active = (tab === 'month' ? filter : upcomingFilter) === f;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseFilter(f)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition active:scale-95 ${
                  active
                    ? 'bg-charcoal text-white dark:bg-white dark:text-[#111]'
                    : 'bg-white text-stone-500 ring-1 ring-stone-200 dark:bg-[#1A1A19] dark:text-stone-400 dark:ring-white/10'
                }`}
              >
                {f !== 'all' && (
                  <i
                    className="h-2 w-2 rounded-full ring-1 ring-black/15"
                    style={{ background: eventColors[f === 'watched' ? 'watched' : f === 'sessions' ? 'plan' : 'watchlist-release'] }}
                  />
                )}
                {t(`agenda.filter.${f}`)}
              </button>
            );
          })}
        </div>
      )}
      {tab !== 'upcoming' && (
        <button
          onClick={() => setCurrentMonth(today.slice(0, 7))}
          className="mb-2 mt-3 text-[10px] font-black text-stone-500"
        >
          {t('agenda.today')}
        </button>
      )}
      <div role="tabpanel" id={`calendar-panel-${tab}`} aria-labelledby={`calendar-tab-${tab}`}>
        {tab === 'month' && (
          <>
            <CalendarMonth
              year={year}
              month={month}
              days={visibleDays}
              today={today}
              onDay={setDay}
            />
            <div className="mt-6 flex flex-col gap-6">
              {genres.length > 1 && (
                <label className="flex items-center gap-3 text-[10px] font-black uppercase text-stone-500">
                  {t('agenda.genre')}
                  <select
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 text-xs normal-case dark:border-white/10 dark:bg-[#1A1A19] dark:text-white"
                  >
                    <option value="">{t('agenda.allGenres')}</option>
                    {genres.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Suspense fallback={null}>
                <WeeklyRecapStory
                  movies={movies.filter(
                    (movie) => movie.status === 'watched' && movie.mediaType !== 'tv'
                  )}
                  variant="calendar"
                />
              </Suspense>
            </div>
          </>
        )}
        {tab === 'upcoming' && (
          <CalendarUpcoming
            filter={upcomingFilter}
            upcomingReleases={
              <UpcomingReleasesFrise
                knownTmdbIds={new Set(movies.filter((m) => m.tmdbId && m.mediaType !== 'tv').map((m) => m.tmdbId!))}
                onSelectMovie={(tmdbId) => props.onPreviewMovie?.(tmdbId)}
                onQuickWatchlist={(tmdbId) => void props.onAddToWatchlist?.(tmdbId)}
                onWatchWith={props.onWatchWith}
              />
            }
            days={days}
            wishes={agenda.wishes}
            releases={agenda.releases}
            watchlistIds={watchlistIds}
            actions={actions}
          />
        )}
        {tab === 'year' && (
          <CalendarYear
            year={year}
            history={agenda.history}
            movies={movies}
            today={today}
            onDay={setDay}
            onToast={onToast}
          />
        )}
      </div>
      {tab !== 'year' && (
        <>
          {agenda.loading && (
            <p className="mt-4 flex items-center gap-2 text-xs text-stone-500">
              <Loader2 size={14} className="animate-spin" />
              {t('agenda.loadingEvents')}
            </p>
          )}
          {agenda.error && (
            <button className={`${agendaGhost} mt-3`} onClick={agenda.refresh}>
              {t('agenda.retry')}
            </button>
          )}
          <div className="mt-6 flex flex-col gap-4">
            <button className={`${agendaAction} w-full`} onClick={() => plan(today)}>
              <CalendarPlus size={15} />
              {t('agenda.plan')}
            </button>
            <button
              className="min-h-9 w-full text-[10px] font-bold text-stone-500"
              onClick={remind}
            >
              {t(reminderActive ? 'agenda.reminderActive' : 'agenda.enableReminders')}
            </button>
          </div>
        </>
      )}
      {day && (
        <CalendarDaySheet
          day={day}
          events={days.get(day) ?? []}
          history={agenda.history}
          movies={movies}
          screenings={agenda.screenings}
          favoriteCinema={favoriteCinema}
          subscription={props.subscription}
          actions={actions}
          onClose={() => setDay(null)}
          onRewatch={props.onRewatch}
          onReview={props.onReview}
          onAddWatched={props.onAddWatched}
          onShowtime={showtime}
          onDelete={remove}
          onConfirm={confirm}
        />
      )}
      {composer &&
        profileId &&
        (composer.mode === 'programme' ? (
          <ScreeningProgrammePicker
            profileId={profileId}
            favoriteCinema={favoriteCinema}
            initialDate={composer.day}
            onClose={() => setComposer(null)}
            onCreated={agenda.refresh}
            onManualEntry={() => setComposer({ ...composer, mode: 'manual' })}
            onAddToWatchlist={(id) => void props.onAddToWatchlist?.(id)}
            onToast={onToast}
          />
        ) : (
          <CinemaScreeningComposer
            profileId={profileId}
            initialDate={new Date(`${composer.day}T12:00:00`)}
            onClose={() => setComposer(null)}
            onCreated={agenda.refresh}
            onAddToWatchlist={(id) => void props.onAddToWatchlist?.(id)}
            onToast={onToast}
          />
        ))}
    </div>
  );
}
