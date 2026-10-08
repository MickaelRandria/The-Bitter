import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AgendaEvent } from '../utils/calendarAgenda';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { eventColors } from './CalendarEventCard';

export default function CalendarMonth({
  year,
  month,
  days,
  today,
  onDay,
}: {
  year: number;
  month: number;
  days: Map<string, AgendaEvent[]>;
  today: string;
  onDay: (day: string) => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const start = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return (
    <>
      <div className="grid grid-cols-7 gap-1.5" aria-label={t('agenda.month')}>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={`label:${i}`}
            className="py-1 text-center text-[10px] font-black text-stone-500"
          >
            {new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
              new Date(2024, 0, i + 1)
            )}
          </span>
        ))}
        {Array.from({ length: start }, (_, i) => (
          <span key={`empty:${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const day = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const events = days.get(day) ?? [];
          const main = events.find((event) => event.posterUrl);
          const session = events.find((event) => event.kind === 'screening');
          const kinds = [...new Set(events.map((event) => event.kind))];
          const current = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onDay(day)}
              aria-label={t('agenda.openDay', {
                date: new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Europe/Paris',
                }).format(new Date(`${day}T12:00:00Z`)),
                n: events.length,
              })}
              className={`relative aspect-[2/3] min-w-0 overflow-hidden rounded-[10px] bg-stone-200/60 text-left transition active:scale-95 dark:bg-[#151514] ${current ? 'ring-2 ring-[#D9FF00] ring-offset-2 ring-offset-cream dark:ring-offset-[#0c0c0c]' : ''}`}
            >
              {main?.posterUrl && (
                <img
                  src={resizeTmdbImage(main.posterUrl, 'w154')}
                  alt=""
                  loading="lazy"
                  className={`absolute inset-0 h-full w-full object-cover ${day >= today && main.kind !== 'watched' ? 'opacity-45' : ''}`}
                />
              )}
              {main && (
                <span className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />
              )}
              <span
                className={`absolute left-1 top-1 text-[10px] font-black ${main ? 'text-white' : 'text-stone-500 dark:text-stone-400'}`}
              >
                {i + 1}
              </span>
              {events.length > 1 && day < today && (
                <span className="absolute right-1 top-1 text-[8px] font-black text-white">
                  {events.filter((event) => event.kind === 'watched').length || ''}
                </span>
              )}
              <span className="absolute bottom-1 left-1 right-1 flex flex-wrap items-center gap-1">
                {current && session?.startsAt ? (
                  <span className="rounded-full bg-[#D9FF00] px-1 text-[8px] font-black text-[#111]">
                    {new Intl.DateTimeFormat(locale, {
                      timeZone: 'Europe/Paris',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(session.startsAt)}
                  </span>
                ) : (
                  kinds.map((kind) => (
                    <i
                      key={kind}
                      className="h-1.5 w-1.5 rounded-full ring-1 ring-black/20"
                      style={{ background: eventColors[kind] }}
                    />
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-[10px] font-bold text-stone-500 dark:text-stone-400">
        {(['watched', 'screening', 'plan', 'watchlist-release', 'release'] as const).map((kind) => (
          <span key={kind} className="flex items-center gap-1">
            <i
              className="h-2 w-2 rounded-full ring-1 ring-black/15"
              style={{ background: eventColors[kind] }}
            />
            {t(`agenda.legend.${kind}`)}
          </span>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-white p-4 text-xs font-medium leading-relaxed text-stone-500 dark:bg-[#151514] dark:text-stone-400">
        {t('agenda.monthHint')}
      </p>
    </>
  );
}
