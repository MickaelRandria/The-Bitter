import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import {
  CinemaProgrammeFilm,
  CinemaScreening,
  CinemaShowtime,
  CinemaSubscription,
  FavoriteCinema,
  Movie,
} from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchCinemaProgramme } from '../services/cinemaDirectory';
import { AgendaEvent, calendarDay, CalendarWatch } from '../utils/calendarAgenda';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { useDialog } from '../utils/useDialog';
import ShareStoryButtonSimple from './ShareStoryButtonSimple';
import CalendarEventCard, {
  agendaAction,
  agendaGhost,
  agendaLabel,
  CalendarActions,
} from './CalendarEventCard';

interface Props {
  day: string;
  events: AgendaEvent[];
  history: CalendarWatch[];
  movies: Movie[];
  screenings: CinemaScreening[];
  favoriteCinema?: FavoriteCinema;
  subscription?: CinemaSubscription;
  actions: CalendarActions;
  onClose: () => void;
  onRewatch?: (movie: Movie) => void;
  onReview?: (movie: Movie) => void;
  onAddWatched?: (day: string) => void;
  onShowtime: (film: CinemaProgrammeFilm, showtime: CinemaShowtime) => void;
  onDelete: (screening: CinemaScreening) => void;
  onConfirm: (screening: CinemaScreening) => void;
}

export default function CalendarDaySheet(props: Props) {
  const { day, actions, favoriteCinema, movies, onClose } = props;
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const dialog = useDialog(onClose, t('agenda.dayTitle'));
  const [programme, setProgramme] = useState<CinemaProgrammeFilm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const past = day < actions.today;
  const today = day === actions.today;
  useEffect(() => {
    let cancelled = false;
    setProgramme([]);
    setError(false);
    if (past || !favoriteCinema) return;
    setLoading(true);
    const date = `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
    void fetchCinemaProgramme(favoriteCinema.id, date)
      .then((result) => {
        if (cancelled) return;
        setError(!!result.error);
        setProgramme(
          (result.data?.films ?? [])
            .map((film) => ({
              ...film,
              showtimes: film.showtimes.filter(
                (showtime) =>
                  calendarDay(showtime.startsAt) === day && showtime.startsAt > Date.now()
              ),
            }))
            .filter((film) => film.showtimes.length)
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [day, past, favoriteCinema?.id]);
  const watches = props.history.filter((watch) => watch.day === day);
  const futureEvents = props.events.filter((event) => event.kind !== 'watched');
  const time = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  const normalTitle = (title: string) =>
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        {...dialog.props}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[2rem] bg-cream px-5 pb-8 pt-4 text-charcoal shadow-2xl dark:bg-[#0c0c0c] dark:text-white sm:max-w-md sm:rounded-[2rem]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-300 dark:bg-white/20" />
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-[#D9FF00]">
              {t(today ? 'agenda.today' : past ? 'agenda.yourWatches' : 'agenda.upcoming')}
            </p>
            <h2 className="mt-1 text-2xl font-black capitalize tracking-tight">
              {new Intl.DateTimeFormat(locale, {
                timeZone: 'Europe/Paris',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date(`${day}T12:00:00Z`))}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white dark:bg-white/10"
          >
            <X size={18} />
          </button>
        </header>
        {watches.length > 0 && (
          <>
            <h3 className={agendaLabel}>{t('agenda.yourWatches')}</h3>
            <div className="space-y-3">
              {watches.map((entry) => {
                const movie = movies.find((item) => item.id === entry.movieId);
                if (!movie) return null;
                const watch = movie.watches?.find((item) => item.id === entry.watchId);
                const context = watch?.viewingContext;
                const venue =
                  context?.locationType === 'cinema'
                    ? context.cinemaName || t('agenda.cinema')
                    : context?.locationType === 'home'
                      ? t('agenda.home')
                      : context?.locationType === 'other'
                        ? t('agenda.otherPlace')
                        : '';
                const payment =
                  context?.paymentType === 'subscription'
                    ? context.subscriptionId === props.subscription?.id
                      ? props.subscription.name
                      : t('agenda.subscription')
                    : context?.paymentType
                      ? t(`agenda.payment.${context.paymentType}`)
                      : '';
                const snapshot: Movie = {
                  ...movie,
                  dateWatched: Date.parse(`${day}T12:00:00Z`),
                  ratings: watch?.ratings ?? movie.ratings,
                  adaptiveRating: watch?.adaptiveRating ?? movie.adaptiveRating,
                };
                return (
                  <article key={entry.id} className="rounded-[18px] bg-white p-3 dark:bg-[#1A1A19]">
                    <div className="flex gap-3">
                      <div className="h-[69px] w-[46px] shrink-0 overflow-hidden rounded-lg bg-stone-200 dark:bg-white/5">
                        {movie.posterUrl && (
                          <img
                            src={resizeTmdbImage(movie.posterUrl, 'w185')}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-black">{movie.title}</h3>
                        <span className="mt-1 inline-block rounded-full bg-[#D9FF00] px-2 py-0.5 text-[11px] font-black text-[#111]">
                          {entry.rating.toLocaleString(locale, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                        </span>
                        <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                          {[venue, payment].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {props.onRewatch && (
                        <button
                          className={agendaGhost}
                          onClick={() => {
                            onClose();
                            props.onRewatch?.(movie);
                          }}
                        >
                          {t('agenda.rewatch')}
                        </button>
                      )}
                      <ShareStoryButtonSimple movie={snapshot} compact />
                      {props.onReview && (
                        <button
                          className={agendaGhost}
                          onClick={() => {
                            onClose();
                            props.onReview?.(movie);
                          }}
                        >
                          {t('agenda.writeReview')}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        {past && !watches.length && (
          <button
            className={`${agendaAction} mt-6 w-full`}
            onClick={() => {
              onClose();
              props.onAddWatched?.(day);
            }}
          >
            {t('agenda.addWatchedDay')}
          </button>
        )}
        {!past && futureEvents.length > 0 && (
          <>
            <h3 className={agendaLabel}>{t(today ? 'agenda.yourSession' : 'agenda.dayEvents')}</h3>
            <div className="space-y-3">
              {futureEvents.map((event) => {
                const screening = props.screenings.find((item) => item.id === event.screeningId);
                return (
                  <div key={event.id}>
                    <CalendarEventCard event={event} actions={actions} />
                    {screening && (
                      <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                        {screening.bookingUrl && (
                          <a
                            href={screening.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={agendaGhost}
                          >
                            {t('agenda.book')}
                          </a>
                        )}
                        {screening.status === 'pending' && (
                          <button
                            className={agendaAction}
                            disabled={actions.busyId === event.id}
                            onClick={() => props.onConfirm(screening)}
                          >
                            {t('agenda.booked')}
                          </button>
                        )}
                        <button
                          className={agendaGhost}
                          disabled={actions.busyId === event.id}
                          onClick={() => props.onDelete(screening)}
                        >
                          {t('agenda.removeSession')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {!past && (
          <section>
            <h3 className={agendaLabel}>
              {favoriteCinema
                ? t(today ? 'agenda.tonightAt' : 'agenda.programmeAt', {
                    cinema: favoriteCinema.name,
                  })
                : t('agenda.chooseCinema')}
            </h3>
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-stone-500">
                <Loader2 size={14} className="animate-spin" />
                {t('agenda.loadingProgramme')}
              </p>
            ) : programme.length ? (
              <div className="space-y-2">
                {programme.map((film) => {
                  const seen = movies.find(
                    (movie) =>
                      movie.status === 'watched' &&
                      movie.mediaType !== 'tv' &&
                      normalTitle(movie.title) === normalTitle(film.title)
                  );
                  const rating = seen
                    ? props.history.filter((entry) => entry.movieId === seen.id).at(-1)?.rating
                    : undefined;
                  return (
                    <article
                      key={film.filmId}
                      className="rounded-2xl bg-white px-3 py-3 dark:bg-[#161615]"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h4 className="text-xs font-extrabold">{film.title}</h4>
                        {seen && (
                          <span className="shrink-0 rounded-full bg-[#D9FF00] px-2 py-0.5 text-[10px] font-black text-[#111]">
                            {t('agenda.seen')}
                            {rating != null
                              ? ` · ${rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                              : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {film.showtimes.map((showtime) => {
                          const saved = props.screenings.some(
                            (screening) =>
                              screening.startsAt === showtime.startsAt &&
                              screening.cinemaName === favoriteCinema?.name &&
                              normalTitle(screening.title) === normalTitle(film.title)
                          );
                          return (
                            <button
                              key={showtime.id}
                              disabled={saved || !!actions.busyId}
                              aria-label={t('agenda.planShowtime', {
                                title: film.title,
                                time: time(showtime.startsAt),
                              })}
                              onClick={() => props.onShowtime(film, showtime)}
                              className={`min-h-9 rounded-lg px-3 py-2 text-[11px] font-extrabold ${saved ? 'bg-[#D9FF00] text-[#111]' : 'bg-stone-100 dark:bg-[#262625]'}`}
                            >
                              {time(showtime.startsAt)}
                              {showtime.version && (
                                <small className="ml-1 text-[9px] opacity-60">
                                  {showtime.version}
                                </small>
                              )}
                              {saved && ' ✓'}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-4 text-xs leading-relaxed text-stone-500 dark:bg-[#151514]">
                {t(
                  error
                    ? 'agenda.programmeError'
                    : favoriteCinema
                      ? today
                        ? 'agenda.noMoreShowtimes'
                        : 'agenda.programmeNotPublished'
                      : 'agenda.noFavoriteCinema'
                )}
              </p>
            )}
            <button className={`${agendaAction} mt-4 w-full`} onClick={() => actions.onPlan(day)}>
              {t('agenda.plan')}
            </button>
          </section>
        )}
      </div>
    </div>,
    document.body
  );
}
