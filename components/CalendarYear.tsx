import React, { useMemo, useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { calendarYear, CalendarWatch } from '../utils/calendarAgenda';
import { shareCalendarYear } from '../utils/calendarYearStory';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { agendaAction, agendaLabel } from './CalendarEventCard';

export default function CalendarYear({
  year,
  history,
  movies,
  today,
  onDay,
  onToast,
}: {
  year: number;
  history: CalendarWatch[];
  movies: Movie[];
  today: string;
  onDay: (day: string) => void;
  onToast?: (message: string) => void;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const data = useMemo(() => calendarYear(history, year), [history, year]);
  const months = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: 'short' })
      .format(new Date(2024, month, 1))
      .replace('.', '')
  );
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month, 1))
  );
  const weekdays = Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, day + 1))
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [goal, setGoal] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('bitter_calendar_goal_v1'));
      return Number.isInteger(saved) && saved > 0 ? saved : 100;
    } catch {
      return 100;
    }
  });
  const intensityColors = ['#1A1A19', '#596300', '#9DB900', '#D9FF00'];
  const selected = selectedDay?.startsWith(`${year}-`) ? (data.days.get(selectedDay) ?? []) : [];
  const share = async () => {
    setSharing(true);
    try {
      const outcome = await shareCalendarYear(
        year,
        data.best,
        movies,
        months,
        {
          title: t('agenda.yearPosters'),
          summary: t('agenda.yearSummary', {
            n: data.total,
            rating: data.average.toLocaleString(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          }),
          empty: t('agenda.noFilm'),
          future: t('agenda.soon'),
          record: t('agenda.streakDays', { n: data.longestStreak }),
        },
        today
      );
      if (outcome !== 'cancelled')
        onToast?.(t(outcome === 'downloaded' ? 'agenda.storyDownloaded' : 'agenda.storyShared'));
    } catch {
      onToast?.(t('agenda.storyError'));
    } finally {
      setSharing(false);
    }
  };
  return (
    <>
      <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-stone-500">
        {t('agenda.yearSummary', {
          n: data.total,
          rating: data.average.toLocaleString(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        })}
      </p>
      <h2 className={agendaLabel}>{t('agenda.eachDay')}</h2>
      <div className="space-y-[3px]" role="group" aria-label={t('agenda.eachDay')}>
        {data.heatmap.map((row, month) => (
          <div
            key={month}
            className="grid items-center gap-[2px]"
            style={{ gridTemplateColumns: '27px repeat(31,minmax(0,1fr))' }}
          >
            <span className="truncate text-[8px] font-black uppercase text-stone-500">
              {months[month]}
            </span>
            {row.map((cell, index) =>
              cell ? (
                <button
                  key={cell.day}
                  type="button"
                  onClick={() => setSelectedDay(cell.day)}
                  aria-pressed={selectedDay === cell.day}
                  aria-label={t('agenda.heatmapDay', { date: cell.day, n: cell.count })}
                  title={t('agenda.heatmapDay', { date: cell.day, n: cell.count })}
                  className={`aspect-square w-full rounded-[2px] outline-offset-1 ${selectedDay === cell.day ? 'ring-1 ring-stone-500 dark:ring-white' : ''} ${cell.intensity === 0 ? 'bg-stone-200 dark:bg-[#1A1A19]' : ''}`}
                  style={
                    cell.intensity ? { background: intensityColors[cell.intensity] } : undefined
                  }
                />
              ) : (
                <span key={`absent:${index}`} />
              )
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-stone-500">
        <span>0</span>
        {intensityColors.map((color) => (
          <i key={color} className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
        ))}
        <span>3+</span>
      </div>
      <div className="mt-3 rounded-xl bg-white p-3 text-xs text-stone-500 dark:bg-[#151514] dark:text-stone-400">
        {!selectedDay?.startsWith(`${year}-`) ? (
          t('agenda.heatmapHint')
        ) : (
          <>
            <b className="text-charcoal dark:text-white">
              {new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                timeZone: 'Europe/Paris',
              }).format(new Date(`${selectedDay}T12:00:00Z`))}
            </b>
            <div className="mt-2 space-y-1">
              {selected.length
                ? selected.map((watch) => {
                    const movie = movies.find((film) => film.id === watch.movieId);
                    return (
                      <button
                        key={watch.id}
                        onClick={() => onDay(watch.day)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="truncate">{movie?.title}</span>
                        <b className="text-forest dark:text-[#D9FF00]">
                          {watch.rating.toLocaleString(locale, {
                            maximumFractionDigits: 1,
                            minimumFractionDigits: 1,
                          })}
                        </b>
                      </button>
                    );
                  })
                : t('agenda.noFilm')}
            </div>
          </>
        )}
      </div>
      <h2 className={agendaLabel}>{t('agenda.yearPosters')}</h2>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {data.best.map((entry, month) => {
          const movie = movies.find((film) => film.id === entry?.movieId);
          const future = `${year}-${String(month + 1).padStart(2, '0')}` > today.slice(0, 7);
          return (
            <figure key={month} className="min-w-0">
              <button
                disabled={!entry}
                onClick={() => entry && onDay(entry.day)}
                aria-label={t('agenda.monthBest', {
                  month: monthNames[month],
                  title: movie?.title ?? t(future ? 'agenda.soon' : 'agenda.noFilm'),
                })}
                className={`relative grid aspect-[2/3] w-full place-items-center overflow-hidden rounded-lg text-[10px] font-bold text-stone-500 ${future ? 'border border-dashed border-stone-300 dark:border-white/15' : 'bg-stone-200 dark:bg-[#1A1A19]'}`}
              >
                {movie?.posterUrl ? (
                  <img
                    src={resizeTmdbImage(movie.posterUrl, 'w185')}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  t(future ? 'agenda.soon' : 'agenda.noFilm')
                )}
                {entry && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-[#D9FF00] px-1.5 py-0.5 text-[10px] font-black text-[#111]">
                    {entry.rating.toLocaleString(locale, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })}
                  </span>
                )}
              </button>
              <figcaption className="mt-1 text-center text-[9px] font-black uppercase tracking-widest text-stone-500">
                {months[month]}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <h2 className={agendaLabel}>{t('agenda.records')}</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 dark:bg-[#151514]">
          <p className="text-[9px] font-black uppercase text-stone-500">{t('agenda.bestMonth')}</p>
          <b className="mt-1 block text-lg font-black capitalize text-charcoal dark:text-white">
            {data.bestMonth != null ? monthNames[data.bestMonth] : '—'}
          </b>
          <p className="text-[11px] text-stone-500">
            {t('agenda.filmsCount', {
              n: data.bestMonth != null ? data.monthCounts[data.bestMonth] : 0,
            })}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 dark:bg-[#151514]">
          <p className="text-[9px] font-black uppercase text-stone-500">
            {t('agenda.longestStreak')}
          </p>
          <b className="mt-1 block text-lg font-black text-charcoal dark:text-white">
            {t(data.longestStreak === 1 ? 'agenda.daysCount.one' : 'agenda.daysCount', {
              n: data.longestStreak,
            })}
          </b>
          <p className="text-[11px] text-stone-500">{t('agenda.consecutive')}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 dark:bg-[#151514]">
          <p className="text-[9px] font-black uppercase text-stone-500">
            {t('agenda.yourWeekday')}
          </p>
          <b className="mt-1 block text-lg font-black capitalize text-charcoal dark:text-white">
            {data.favoriteWeekday != null ? weekdays[data.favoriteWeekday] : '—'}
          </b>
          <p className="text-[11px] text-stone-500">
            {t('agenda.filmsCount', {
              n: data.favoriteWeekday != null ? data.weekdayCounts[data.favoriteWeekday] : 0,
            })}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 dark:bg-[#151514]">
          <label htmlFor="calendar-goal" className="text-[9px] font-black uppercase text-stone-500">
            {t('agenda.goal', { year })}
          </label>
          <div className="mt-1 flex items-center gap-1 text-lg font-black text-charcoal dark:text-white">
            <span>{data.total} /</span>
            <input
              id="calendar-goal"
              aria-label={t('agenda.goal', { year })}
              type="number"
              min={1}
              max={10000}
              value={goal}
              onChange={(event) => {
                const next = Math.min(10000, Math.max(1, Math.round(Number(event.target.value))));
                setGoal(next);
                try {
                  localStorage.setItem('bitter_calendar_goal_v1', String(next));
                } catch {
                  /* L'objectif reste réglable même sans stockage. */
                }
              }}
              className="w-16 min-w-0 rounded bg-transparent px-1 outline-offset-2"
            />
          </div>
          <div
            role="progressbar"
            aria-label={t('agenda.goal', { year })}
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(data.total, goal)}
            className="mt-2 h-2 overflow-hidden rounded bg-stone-200 dark:bg-white/10"
          >
            <div
              className="h-full rounded bg-[#D9FF00]"
              style={{ width: `${Math.min(100, (data.total / goal) * 100)}%` }}
            />
          </div>
        </div>
      </div>
      <button
        onClick={() => void share()}
        disabled={sharing}
        className={`${agendaAction} mt-4 w-full`}
      >
        {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
        {t('agenda.shareYear')}
      </button>
    </>
  );
}
