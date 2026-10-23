import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { CheckedScreening, ScreeningCheck } from '../utils/screeningChecks';
import { agendaAction, agendaGhost } from './CalendarEventCard';

interface ScreeningChecksCardProps {
  checks: ScreeningCheck[];
  busyId: string;
  onDismiss: (key: string) => void;
  onDelete: (screening: CheckedScreening) => void;
  onAddToWatchlist?: (tmdbId: number) => void;
}

/**
 * Les remarques sur les séances à venir, en tête de « À venir » : une question
 * courte, et de quoi corriger d'un geste ou dire que c'est voulu.
 */
const ScreeningChecksCard: React.FC<ScreeningChecksCardProps> = ({ checks, busyId, onDismiss, onDelete, onAddToWatchlist }) => {
  const { t, language } = useLanguage();
  if (!checks.length) return null;
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const when = (ms: number) =>
    `${new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms)} · ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(ms)}`;
  const day = (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);

  return (
    <section aria-label={t('agenda.check.title')} className="mb-4 space-y-2.5">
      {checks.map((check) => (
        <div
          key={check.key}
          className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-400/20 dark:bg-amber-500/10"
        >
          <p className="flex items-start gap-2 text-[13px] font-black leading-snug text-charcoal dark:text-white">
            <TriangleAlert size={16} className="mt-px shrink-0 text-amber-600 dark:text-amber-300" />
            {check.kind === 'duplicate' && t('agenda.check.duplicate', { title: check.title, count: String(check.screenings.length) })}
            {check.kind === 'overlap' && t('agenda.check.overlap')}
            {check.kind === 'alreadySeen' && t('agenda.check.alreadySeen', { title: check.screening.title, date: day(check.seenAt) })}
            {check.kind === 'notInCollection' && t('agenda.check.notInCollection', { title: check.screening.title })}
          </p>

          {check.kind === 'duplicate' && (
            <ul className="mt-2.5 space-y-1.5">
              {check.screenings.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 dark:bg-white/5">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-charcoal dark:text-white">{when(s.startsAt)}</span>
                    {s.cinemaName && <span className="block truncate text-[11px] font-medium text-stone-500">{s.cinemaName}</span>}
                  </span>
                  <button type="button" disabled={busyId === `screening:${s.id}`} onClick={() => onDelete(s)} className={`${agendaGhost} shrink-0`}>
                    {t('agenda.check.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {check.kind === 'overlap' && (
            <p className="mt-1.5 pl-6 text-[12px] font-medium leading-snug text-stone-600 dark:text-stone-300">
              {check.first.title} · {when(check.first.startsAt)}
              <br />
              {check.second.title} · {when(check.second.startsAt)}
            </p>
          )}
          {(check.kind === 'alreadySeen' || check.kind === 'notInCollection') && (
            <p className="mt-1 pl-6 text-[12px] font-medium text-stone-600 dark:text-stone-300">{when(check.screening.startsAt)}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            {check.kind === 'notInCollection' && onAddToWatchlist && check.screening.tmdbId && (
              <button
                type="button"
                onClick={() => {
                  onAddToWatchlist(check.screening.tmdbId!);
                  onDismiss(check.key);
                }}
                className={agendaAction}
              >
                {t('agenda.check.addToList')}
              </button>
            )}
            {check.kind === 'alreadySeen' && (
              <button type="button" disabled={busyId === `screening:${check.screening.id}`} onClick={() => onDelete(check.screening)} className={agendaGhost}>
                {t('agenda.check.removeScreening')}
              </button>
            )}
            <button type="button" onClick={() => onDismiss(check.key)} className={agendaGhost}>
              {check.kind === 'alreadySeen'
                ? t('agenda.check.rewatch')
                : check.kind === 'notInCollection'
                  ? t('agenda.check.later')
                  : t('agenda.check.intended')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
};

export default ScreeningChecksCard;
