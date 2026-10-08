import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AgendaEvent, CalendarFilter, shiftCalendarDay } from '../utils/calendarAgenda';
import { TheatreRelease } from '../services/tmdb';
import { resizeTmdbImage } from '../utils/tmdbImage';
import CalendarEventCard, { agendaLabel, CalendarActions } from './CalendarEventCard';

export default function CalendarUpcoming({
  days,
  wishes,
  releases,
  watchlistIds,
  actions,
  filter = 'all',
}: {
  days: Map<string, AgendaEvent[]>;
  wishes: AgendaEvent[];
  releases: TheatreRelease[];
  watchlistIds: Set<number>;
  actions: CalendarActions;
  filter?: CalendarFilter;
}) {
  const showSessions = filter !== 'releases';
  const showReleases = filter !== 'sessions';
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const sessions = [...days.values()]
    .flat()
    .filter((event) => ['screening', 'plan'].includes(event.kind) && event.day >= actions.today)
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));
  const thisWeek = sessions.filter((event) => event.day <= shiftCalendarDay(actions.today, 6));
  const later = sessions.filter((event) => event.day > shiftCalendarDay(actions.today, 6));
  const rows = (events: AgendaEvent[]) => (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2.5">
          <div className="text-center">
            <b className="block text-xl font-black leading-none text-charcoal dark:text-white">
              {Number(event.day.slice(8))}
            </b>
            <span className="mt-1 block text-[9px] font-black uppercase text-stone-500">
              {new Intl.DateTimeFormat(locale, {
                timeZone: 'Europe/Paris',
                ...(event.kind === 'watchlist-release' ? { month: 'short' } : { weekday: 'short' }),
              }).format(new Date(`${event.day}T12:00:00Z`))}
            </span>
          </div>
          <CalendarEventCard event={event} actions={actions} />
        </div>
      ))}
    </div>
  );
  return (
    <>
      {showSessions && (
      <>
      <h2 className={agendaLabel}>{t('agenda.thisWeek')}</h2>
      {thisWeek.length ? (
        rows(thisWeek)
      ) : (
        <p className="rounded-2xl bg-white p-4 text-xs text-stone-500 dark:bg-[#151514]">
          {t('agenda.noSessions')}
        </p>
      )}
      {later.length > 0 && (
        <>
          <h2 className={agendaLabel}>{t('agenda.laterSessions')}</h2>
          {rows(later)}
        </>
      )}
      </>
      )}
      {showReleases && (
      <>
      <h2 className={agendaLabel}>{t('agenda.yourReleases')}</h2>
      {wishes.length ? (
        rows(wishes)
      ) : (
        <p className="rounded-2xl bg-white p-4 text-xs text-stone-500 dark:bg-[#151514]">
          {t('agenda.noWishReleases')}
        </p>
      )}
      <h2 className={agendaLabel}>{t('agenda.majorReleases')}</h2>
      <p className="-mt-1 mb-3 text-[11px] font-medium text-stone-500">
        {t('agenda.majorSubtitle')}
      </p>
      <div className="flex gap-2.5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {releases.map((film) => {
          const mine = watchlistIds.has(film.id);
          return (
            <article key={film.id} className="w-24 shrink-0">
              <div className="relative h-36 overflow-hidden rounded-xl bg-stone-200 dark:bg-[#1A1A19]">
                {film.posterPath && (
                  <img
                    src={resizeTmdbImage(
                      `https://image.tmdb.org/t/p/w185${film.posterPath}`,
                      'w185'
                    )}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <span
                  className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-1 text-[9px] font-black ${mine ? 'bg-[#D9FF00] text-[#111]' : 'bg-black/65 text-white'}`}
                >
                  {mine
                    ? t('agenda.yourList')
                    : new Intl.DateTimeFormat(locale, {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'Europe/Paris',
                      }).format(new Date(`${film.releaseDate}T12:00:00Z`))}
                </span>
              </div>
              <h3 className="mt-1.5 line-clamp-2 min-h-7 text-[11px] font-extrabold leading-tight text-charcoal dark:text-white">
                {film.title}
              </h3>
              <button
                disabled={mine || actions.busyId === `add:${film.id}`}
                onClick={() => actions.onAdd(film.id)}
                aria-label={t('agenda.addFilm', { title: film.title })}
                className={`mt-1.5 min-h-9 w-full rounded-lg px-1 text-[10px] font-black ${mine ? 'bg-[#D9FF00]/15 text-forest dark:text-[#D9FF00]' : 'bg-white text-charcoal dark:bg-[#262625] dark:text-white'} disabled:opacity-70`}
              >
                {t(mine ? 'agenda.inYourList' : 'agenda.addWatchlist')}
              </button>
            </article>
          );
        })}
      </div>
      {!releases.length && <p className="text-xs text-stone-500">{t('agenda.noMajorReleases')}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        {t('agenda.releaseReminderHint')}
      </p>
      </>
      )}
    </>
  );
}
