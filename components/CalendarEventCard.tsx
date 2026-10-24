import React from 'react';
import { Bell, BellRing, CalendarPlus, Check, Eye, Film, ListPlus, Navigation, RotateCcw, Trash2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AgendaEvent, daysUntil, isRemovableSession } from '../utils/calendarAgenda';
import { resizeTmdbImage } from '../utils/tmdbImage';

export const agendaPill =
  'inline-flex min-h-9 items-center justify-center gap-1 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wide transition active:scale-95 disabled:opacity-50';
export const agendaAction = `${agendaPill} bg-[#D9FF00] text-[#111]`;
export const agendaGhost = `${agendaPill} border border-stone-300 text-charcoal dark:border-white/15 dark:text-white`;
export const agendaLabel =
  'mb-2 mt-6 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[.15em] text-stone-500 dark:text-stone-400';
/**
 * Les actions d'une carte, en boutons ronds à icône : elles tiennent toujours
 * sur une ligne, quelle que soit la langue ou la largeur de l'écran. Le libellé
 * reste lu par les lecteurs d'écran (aria-label) et affiché au survol (title).
 */
const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50';
const iconPrimary = `${iconButton} bg-[#D9FF00] text-[#111]`;
const iconGhost = `${iconButton} border border-stone-300 text-charcoal dark:border-white/15 dark:text-white`;

function IconAction({
  label,
  primary,
  onClick,
  disabled,
  className = '',
  children,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`${primary ? iconPrimary : iconGhost} ${className}`}
    >
      {children}
    </button>
  );
}

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
  /** Retirer une séance à venir : la sienne, ou annuler une séance d'espace. */
  onRemove: (event: AgendaEvent) => void;
  /** « Quand partir ? » d'une séance à venir. */
  onRoute: (event: AgendaEvent) => void;
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
      })
        .format(event.startsAt)
        .replace(':', language === 'fr' ? ' h ' : ':')
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
        <div className="mt-2.5 flex items-center gap-2">
          {event.kind === 'plan' && !event.ownPlan && !event.joined && (
            <>
              <IconAction
                primary
                label={t('agenda.accept')}
                disabled={actions.busyId === event.id || event.declined}
                onClick={() => actions.onAccept(event)}
              >
                <Check size={18} strokeWidth={2.6} />
              </IconAction>
              <IconAction
                label={t(event.declined ? 'agenda.reconsider' : 'agenda.unavailable')}
                onClick={() => actions.onDecline(event)}
              >
                {event.declined ? <RotateCcw size={17} /> : <X size={18} />}
              </IconAction>
            </>
          )}
          {event.kind === 'plan' && (event.ownPlan || event.joined) && (
            <span className="text-[10px] font-bold text-stone-500">
              {t(event.ownPlan ? 'agenda.waiting' : 'agenda.joined')}
            </span>
          )}
          {event.kind === 'screening' &&
            event.screeningId &&
            event.startsAt &&
            event.startsAt > Date.now() - 30 * 60_000 && (
              <IconAction primary label={t('route.action')} onClick={() => actions.onRoute(event)}>
                <Navigation size={18} strokeWidth={2.4} />
              </IconAction>
            )}
          {event.kind === 'screening' && (
            <IconAction label={t('agenda.viewSession')} onClick={() => actions.onOpenDay(event.day)}>
              <Eye size={18} />
            </IconAction>
          )}
          {event.kind === 'watchlist-release' && (
            <>
              <IconAction
                primary
                label={t(actions.reminderActive ? 'agenda.reminderActive' : 'agenda.remind')}
                onClick={actions.onRemind}
              >
                {actions.reminderActive ? <BellRing size={18} /> : <Bell size={18} />}
              </IconAction>
              <IconAction label={t('agenda.plan')} onClick={() => actions.onPlan(event.day)}>
                <CalendarPlus size={18} />
              </IconAction>
            </>
          )}
          {event.kind === 'release' && event.tmdbId != null && (
            <IconAction
              primary
              label={t('agenda.addWatchlist')}
              disabled={actions.busyId === `add:${event.tmdbId}`}
              onClick={() => actions.onAdd(event.tmdbId!)}
            >
              <ListPlus size={18} />
            </IconAction>
          )}
          {/* Retirer reste au bout de la ligne, à l'écart : on ne le touche pas par mégarde. */}
          {isRemovableSession(event, actions.today) && (
            <IconAction
              label={t(event.kind === 'plan' ? 'agenda.cancelSession' : 'agenda.removeSession')}
              disabled={actions.busyId === event.id}
              onClick={() => actions.onRemove(event)}
              className="ml-auto"
            >
              <Trash2 size={17} />
            </IconAction>
          )}
        </div>
      </div>
    </article>
  );
}
