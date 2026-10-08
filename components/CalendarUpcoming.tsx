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
  cinema,
}: {
  days: Map<string, AgendaEvent[]>;
  wishes: AgendaEvent[];
  releases: TheatreRelease[];
  watchlistIds: Set<number>;
  actions: CalendarActions;
  filter?: CalendarFilter;
  /** « Au cinéma », venu de Découvrir : à l'affiche, puis le fil des sorties. */
  cinema?: React.ReactNode;
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
      {cinema && (
        <>
          <h2 className={`${agendaLabel} mt-8`}>{t('agenda.atTheCinema')}</h2>
          {cinema}
        </>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        {t('agenda.releaseReminderHint')}
      </p>
      </>
      )}
    </>
  );
}
