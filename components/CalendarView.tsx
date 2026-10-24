import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Ticket, SlidersHorizontal } from 'lucide-react';
import ActionSheet from './ActionSheet';
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
import NavAddShortcuts, { NavShortcut } from './NavAddShortcuts';
import ScreeningProgrammePicker from './ScreeningProgrammePicker';
import UpcomingReleasesFrise from './UpcomingReleasesFrise';
import ScreeningChecksCard from './ScreeningChecksCard';
import { CheckedScreening, DISMISSED_CHECKS_KEY, parseDismissed, screeningChecks } from '../utils/screeningChecks';

const WeeklyRecapStory = lazy(() => import('./WeeklyRecapStory'));
const TicketImportModal = lazy(() => import('./TicketImportModal'));
const ScreeningRouteSheet = lazy(() => import('./ScreeningRouteSheet'));
interface CalendarViewProps {
  movies: Movie[];
  profileId?: string;
  favoriteCinema?: FavoriteCinema;
  /** Prénom affiché sur les affiches « Mon année ». */
  firstName?: string;
  subscription?: CinemaSubscription;
  onAddToWatchlist?: (tmdbId: number) => Promise<boolean>;
  onRewatch?: (movie: Movie) => void;
  onReview?: (movie: Movie) => void;
  onAddWatched?: (day: string) => void;
  /** Séance passée importée d'un billet : noter ce film, vu ce jour-là. */
  onRateWatched?: (tmdbId: number, day: string) => void;
  /** « Bientôt en salle » : ouvrir un film, le voir avec quelqu'un. */
  onPreviewMovie?: (tmdbId: number) => void;
  /** Toucher l'affiche d'un film vu : « Ma note ». */
  onOpenFilm?: (movie: Movie) => void;
  onWatchWith?: (tmdbId: number) => void;
  onToast?: (message: string) => void;
  /** Onglet d'ouverture : « À venir » depuis le bandeau ciné de Découvrir. */
  initialTab?: 'month' | 'upcoming' | 'year';
  /** Le + de la barre : chaque nouvelle valeur > 0 ouvre « Planifier une séance » (plan(today)). */
  planRequest?: number;
  onContextDay?: (day: string) => void;
  /** Le menu du + : chaque nouvelle valeur > 0 ouvre l'import de billets. */
  importRequest?: number;
  /**
   * Appelé une fois la demande traitée : App remet ses compteurs à zéro. Sinon
   * un remontage (bascule Films → Séries → Films) rejouerait la demande.
   */
  onRequestHandled?: () => void;
  onNavShortcut?: (kind: NavShortcut) => void;
  /** Rappel de séance touché (`?screening=`) : ouvre « Quand partir ? » pour cette séance. */
  routeScreeningId?: string;
  onRouteHandled?: () => void;
}

export default function CalendarView(props: CalendarViewProps) {
  const { movies, profileId, favoriteCinema, onToast } = props;
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const [today, setToday] = useState(() => calendarDay(Date.now()));
  const [currentMonth, setCurrentMonth] = useState(() => calendarDay(Date.now()).slice(0, 7));
  const [tab, setTab] = useState<'month' | 'upcoming' | 'year'>(() => props.initialTab ?? 'month');
  const [day, setDay] = useState<string | null>(null);
  const [consultedDay, setConsultedDay] = useState(() => calendarDay(Date.now()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openDay = (date: string) => { setConsultedDay(date); setDay(date); };
  useEffect(() => { props.onContextDay?.(consultedDay); }, [consultedDay, props.onContextDay]);
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
  const [composer, setComposer] = useState<{ mode: 'programme' | 'manual'; day: string; fromNav?: boolean } | null>(
    null
  );
  /** Import des billets UGC par image : l'entrée la plus rapide pour une place déjà réservée. */
  const [importingTickets, setImportingTickets] = useState(false);
  const [busyId, setBusyId] = useState('');
  const busy = useRef(false);
  const [reminderActive, setReminderActive] = useState(false);
  const [declined, setDeclined] = useState<string[]>([]);
  const unavailableKey = `bitter_calendar_unavailable_v1_${profileId ?? 'local'}`;
  const agenda = useCalendarAgenda(movies, profileId, language, today);
  const [routeId, setRouteId] = useState<string | null>(null);
  const routeScreening = routeId ? agenda.screenings.find((s) => s.id === routeId) : undefined;
  useEffect(() => {
    const wanted = props.routeScreeningId;
    if (!wanted) return;
    // Les séances arrivent après le premier rendu : on attend celle du rappel.
    const screening = agenda.screenings.find((s) => s.id === wanted);
    if (!screening) return;
    // Le rappel d'avant-séance seulement : celui d'après sert à noter le film.
    if (screening.startsAt > Date.now() - 30 * 60_000) setRouteId(wanted);
    props.onRouteHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.routeScreeningId, agenda.screenings]);
  /** Remarques écartées d'un « c'est voulu » : sur l'appareil, elles ne reviennent pas. */
  const [dismissedChecks, setDismissedChecks] = useState<Set<string>>(() => {
    try {
      return parseDismissed(localStorage.getItem(DISMISSED_CHECKS_KEY));
    } catch {
      return new Set();
    }
  });
  const checks = useMemo(
    () => screeningChecks(agenda.screenings, movies, Date.now(), dismissedChecks),
    // `today` avance chaque minute : une séance passée sort d'elle-même des remarques.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agenda.screenings, movies, dismissedChecks, today],
  );
  const dismissCheck = (key: string) =>
    setDismissedChecks((prev) => {
      const next = new Set(prev).add(key);
      try {
        localStorage.setItem(DISMISSED_CHECKS_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        // Navigation privée : la remarque reviendra, tant pis.
      }
      return next;
    });
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
  const plan = (date: string, fromNav = false) => {
    if (!profileId) {
      onToast?.(t('agenda.loginSessions'));
      return;
    }
    setDay(null);
    setComposer({ mode: favoriteCinema ? 'programme' : 'manual', day: date, fromNav });
  };
  /** Même geste que le bouton « Importer mes billets » de l'onglet À venir. */
  const importTickets = () => {
    if (!profileId) {
      onToast?.('Connecte-toi pour importer tes billets et recevoir leurs rappels.');
      return;
    }
    setDay(null);
    setComposer(null);
    // Les billets importés arrivent dans « À venir » : on y est déjà en les voyant apparaître.
    setTab('upcoming');
    setImportingTickets(true);
  };

  /**
   * Demandes venues de la barre du bas. App remet ses compteurs à 0 en quittant
   * le calendrier : la dernière valeur traitée part donc de 0, pas de la valeur
   * de montage, car App peut ouvrir le calendrier et poser la demande d'un même
   * geste. La ref évite aussi le double traitement des effets en StrictMode.
   */
  const handledPlan = useRef(0);
  const handledImport = useRef(0);
  const planRequest = props.planRequest ?? 0;
  const importRequest = props.importRequest ?? 0;
  useEffect(() => {
    if (planRequest <= 0) {
      handledPlan.current = 0;
      return;
    }
    if (planRequest === handledPlan.current) return;
    handledPlan.current = planRequest;
    setImportingTickets(false);
    plan(consultedDay, true);
    props.onRequestHandled?.();
    // `plan` et `today` sont lus au moment de la demande, sans la rejouer quand ils changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planRequest]);
  useEffect(() => {
    if (importRequest <= 0) {
      handledImport.current = 0;
      return;
    }
    if (importRequest === handledImport.current) return;
    handledImport.current = importRequest;
    importTickets();
    props.onRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRequest]);
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
    onRoute: (event) => event.screeningId && setRouteId(event.screeningId),
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
  const removeChecked = (checked: CheckedScreening) => {
    const screening = agenda.screenings.find((item) => item.id === checked.id);
    if (screening) remove(screening);
  };
  const addCheckedToWatchlist = (tmdbId: number) => {
    if (!props.onAddToWatchlist) return;
    void props.onAddToWatchlist(tmdbId).then((ok) => {
      if (ok) onToast?.(t('agenda.check.added'));
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
    const nextMonth = date.toISOString().slice(0, 7);
    setCurrentMonth(nextMonth);
    setConsultedDay(previous => nextMonth + '-' + String(Math.min(Number(previous.slice(8)), new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate())).padStart(2, '0'));
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
  const navShortcuts = composer?.fromNav && props.onNavShortcut ? (
    <NavAddShortcuts onAction={(kind) => { setComposer(null); props.onNavShortcut?.(kind); }} />
  ) : undefined;

  return (
    <div className="mx-auto w-full max-w-lg pb-28 pt-1 text-charcoal dark:text-white">
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
      {tab !== 'year' && <div className="mt-3 mb-3 flex flex-wrap items-center gap-2">
        <button type="button" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand bg-white px-4 text-xs font-bold dark:border-white/10 dark:bg-white/5"><SlidersHorizontal size={15} />{t(`agenda.filter.${tab === 'upcoming' ? upcomingFilter : filter}`)}{genre && <span>· {genre}</span>}</button>
        {filter !== 'all' && <button type="button" onClick={() => chooseFilter('all')} className="min-h-11 text-xs font-bold text-stone-500">{t('feed.clearFilter')}</button>}
      </div>}
      {tab !== 'upcoming' && (
        <button
          onClick={() => { setCurrentMonth(today.slice(0, 7)); setConsultedDay(today); }}
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
              selectedDay={consultedDay}
              onDay={openDay}
            />
            <div className="mt-6 flex flex-col gap-6">
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
        {tab !== 'year' && (
          <ScreeningChecksCard
            checks={checks}
            busyId={busyId}
            onDismiss={dismissCheck}
            onDelete={removeChecked}
            onAddToWatchlist={props.onAddToWatchlist ? addCheckedToWatchlist : undefined}
          />
        )}
        {tab === 'upcoming' && !agenda.loading && !agenda.screenings.some(s => s.startsAt > Date.now()) && (
          <button
            type="button"
            onClick={() =>
              profileId
                ? setImportingTickets(true)
                : onToast?.('Connecte-toi pour importer tes billets et recevoir leurs rappels.')
            }
            className="mb-4 flex w-full items-center gap-3 rounded-[1.25rem] bg-forest p-3.5 text-left text-white shadow-lg shadow-forest/20 transition active:scale-[0.98]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Ticket size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">Importer mes billets</span>
              <span className="mt-0.5 block text-[11.5px] font-medium leading-snug text-white/80">
                {agenda.screenings.some((screening) => screening.startsAt > Date.now())
                  ? 'Une autre réservation UGC ? Ajoute-la en une image.'
                  : 'Tu as réservé sur UGC ? L’image de ta séance suffit.'}
              </span>
            </span>
          </button>
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
            firstName={props.firstName}
            onDay={openDay}
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
          {!agenda.loading && tab === 'month' && monthEvents.length === 0 && <button className={`${agendaAction} mt-6 w-full`} onClick={() => plan(consultedDay)}><CalendarPlus size={15} />{t('agenda.plan')}</button>}
        </>
      )}
      {settingsOpen && <ActionSheet title={t('pageActions.calendarSettings')} onClose={() => setSettingsOpen(false)}>
        {tab !== 'year' && (
        <div
          role="radiogroup"
          aria-label={t('agenda.filterLabel')}
          className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <div className="mt-4">{genres.length > 1 && (
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
              )}</div>
        <button type="button" className="mt-4 min-h-11 text-xs font-bold text-stone-500" onClick={remind}>{t(reminderActive ? 'agenda.reminderActive' : 'agenda.enableReminders')}</button>
        <button type="button" className={`${agendaAction} mt-4 w-full`} onClick={() => setSettingsOpen(false)}>{t('pageActions.backCalendar')}</button>
      </ActionSheet>}
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
          onOpenFilm={props.onOpenFilm}
          onAddWatched={props.onAddWatched}
          onShowtime={showtime}
          onDelete={remove}
          onConfirm={confirm}
        />
      )}
      {importingTickets && profileId && (
        <Suspense fallback={null}>
          <TicketImportModal
            profileId={profileId}
            favoriteCinema={favoriteCinema}
            existingScreenings={agenda.screenings}
            onClose={() => setImportingTickets(false)}
            onImported={agenda.refresh}
            onAddToWatchlist={(id) => void props.onAddToWatchlist?.(id)}
            onRateWatched={props.onRateWatched}
            onToast={onToast}
          />
        </Suspense>
      )}
      {routeScreening && (
        <Suspense fallback={null}>
          <ScreeningRouteSheet screening={routeScreening} runtime={movies.find((m) => m.tmdbId != null && m.tmdbId === routeScreening.tmdbId)?.runtime} onClose={() => setRouteId(null)} onToast={onToast} />
        </Suspense>
      )}
      {composer &&
        profileId &&
        (composer.mode === 'programme' ? (
          <ScreeningProgrammePicker
            navShortcuts={navShortcuts}
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
            navShortcuts={navShortcuts}
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
