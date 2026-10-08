import React from 'react';
import { Film } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AgendaEvent, daysUntil } from '../utils/calendarAgenda';
import { resizeTmdbImage } from '../utils/tmdbImage';

export const agendaPill =
  'inline-flex min-h-9 items-center justify-center gap-1 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wide transition active:scale-95 disabled:opacity-50';
export const agendaAction = `${agendaPill} bg-[#D9FF00] text-[#111]`;
export const agendaGhost = `${agendaPill} border border-stone-300 text-charcoal dark:border-white/15 dark:text-white`;
export const agendaLabel =
  'mb-2 mt-6 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[.15em] text-stone-500 dark:text-stone-400';
export const eventColors = {
  watched: '#D9FF00',
  screening: '#FFFFFF',
  plan: '#7FB8FF',
  'watchlist-release': '#F08A24',
  release: '#888883',
};

export interface CalendarActions {
  today: string;
  busyId: string;
  onOpenDay: (day: string) => void;
  onAccept: (event: AgendaEvent) => void;
  onDecline: (event: AgendaEvent) => void;
  onPlan: (day: string) => void;
  onAdd: (id: number) => void;
  onRemind: () => void;
  reminderActive: boolean;
}

export default function CalendarEventCard({
  event,
  actions,
}: {
  event: AgendaEvent;
  actions: CalendarActions;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const time = event.startsAt
    ? new Intl.DateTimeFormat(locale, {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      }).format(event.startsAt)
    : '';
  const label =
    event.kind === 'watchlist-release'
      ? t('agenda.inDays', { n: daysUntil(event.day, actions.today) })
      : event.kind === 'release'
        ? t('agenda.theatreRelease')
        : event.kind === 'screening'
          ? t(event.pending ? 'agenda.pending' : 'agenda.scheduled')
          : t('agenda.proposed', { space: event.spaceName ?? t('agenda.space') });
  return (
    <article
      className={`flex min-w-0 items-start gap-3 rounded-[18px] bg-white p-3 dark:bg-[#1A1A19] ${event.declined ? 'opacity-60' : ''}`}
    >
      <div className="h-[69px] w-[46px] shrink-0 overflow-hidden rounded-lg bg-stone-200 dark:bg-white/5">
        {event.posterUrl ? (
          <img
            src={resizeTmdbImage(event.posterUrl, 'w185')}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Film size={18} className="m-auto mt-6 text-stone-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black text-forest dark:text-[#D9FF00]">
          {time && `${time} · `}
          {label}
        </p>
        <h3 className="mt-0.5 truncate text-sm font-black text-charcoal dark:text-white">
          {event.title}
        </h3>
        <p className="mt-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
          {[
            event.cinemaName,
            event.spaceName,
            event.participants != null ? t('agenda.participants', { n: event.participants }) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {event.kind === 'plan' && !event.ownPlan && !event.joined && (
            <>
              <button
                className={agendaAction}
                disabled={actions.busyId === event.id || event.declined}
                onClick={() => actions.onAccept(event)}
              >
                {t('agenda.accept')}
              </button>
              <button className={agendaGhost} onClick={() => actions.onDecline(event)}>
                {t(event.declined ? 'agenda.reconsider' : 'agenda.unavailable')}
              </button>
            </>
          )}
          {event.kind === 'plan' && (event.ownPlan || event.joined) && (
            <span className="text-[10px] font-bold text-stone-500">
              {t(event.ownPlan ? 'agenda.waiting' : 'agenda.joined')}
            </span>
          )}
          {event.kind === 'screening' && (
            <button className={agendaGhost} onClick={() => actions.onOpenDay(event.day)}>
              {t('agenda.viewSession')}
            </button>
          )}
          {event.kind === 'watchlist-release' && (
            <>
              <button className={agendaAction} onClick={actions.onRemind}>
                {t(actions.reminderActive ? 'agenda.reminderActive' : 'agenda.remind')}
              </button>
              <button className={agendaGhost} onClick={() => actions.onPlan(event.day)}>
                {t('agenda.plan')}
              </button>
            </>
          )}
          {event.kind === 'release' && event.tmdbId != null && (
            <button
              className={agendaAction}
              disabled={actions.busyId === `add:${event.tmdbId}`}
              onClick={() => actions.onAdd(event.tmdbId!)}
            >
              {t('agenda.addWatchlist')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
