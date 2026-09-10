import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Star,
  Tv,
  X,
} from 'lucide-react';
import { Movie, TvEpisodeEntry } from '../types';
import { getTvUpcoming, TvRelease } from '../services/tv';
import { localDate } from '../utils/tvProgress';
import { isSeason, isSeries } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import TvUpcoming from './TvUpcoming';

interface Props {
  movies: Movie[];
  onOpen: (series: Movie) => void;
  onPreview?: (tmdbId: number) => void;
  onAdd?: (tmdbId: number) => Promise<void>;
}

/** Un événement placé sur une case du calendrier. */
interface TvEvent {
  key: string;
  /** `watched` : c'est arrivé. `planned` : c'est annoncé. */
  type: 'watched' | 'planned';
  /** Ce qu'on compte : un épisode vu n'est pas un verdict de saison. */
  kind: 'episode' | 'verdict' | 'airing';
  date: string;
  series: Movie;
  label: string;
  rating?: number;
  posterUrl?: string;
}

/**
 * Noms de jours et de mois dérivés de la langue active. Le 1er janvier 2024 est
 * un lundi : la semaine reste bien lundi → dimanche.
 */
const buildCalendarLabels = (locale: string) => ({
  days: Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i))
  ),
  months: Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, i, 1))
  ),
  monthsShort: Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2024, i, 1)).replace('.', '')
  ),
});

const DayDetailModal: React.FC<{
  day: number;
  monthName: string;
  events: TvEvent[];
  onOpen: (series: Movie) => void;
  onClose: () => void;
}> = ({ day, monthName, events, onOpen, onClose }) => {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 max-h-[80vh] flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] border border-sand dark:border-white/10">
        <div className="flex justify-between items-center p-6 border-b border-sand dark:border-white/10">
          <div>
            <h3 className="text-3xl font-black text-charcoal dark:text-white tracking-tight leading-none">
              {day} {monthName}
            </h3>
            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest mt-1">
              {t('tv.eventCount', { count: events.length })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 transition-all active:scale-90"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 no-scrollbar">
          {events.map((event) => (
            <button
              key={event.key}
              onClick={() => onOpen(event.series)}
              className="w-full flex gap-4 p-3 rounded-2xl bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 items-start text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-16 h-24 rounded-xl overflow-hidden shrink-0 bg-stone-200 dark:bg-[#252525] border dark:border-white/5">
                {event.posterUrl ? (
                  <img
                    src={resizeTmdbImage(event.posterUrl, 'w185')}
                    className="w-full h-full object-cover"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center">
                    <Tv size={20} className="text-stone-300 dark:text-stone-700" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 py-1">
                <h4 className="font-black text-sm text-charcoal dark:text-white leading-tight mb-1">
                  {event.series.title}
                </h4>
                <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">{event.label}</p>
                {event.type === 'planned' ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-bitter-lime/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-forest dark:text-bitter-lime">
                    <CalendarPlus size={10} /> {t('tv.upcoming')}
                  </span>
                ) : event.rating != null ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-charcoal dark:bg-white px-2 py-0.5 text-[9px] font-black text-white dark:text-charcoal">
                    <Star size={10} strokeWidth={3} /> {event.rating.toFixed(1)}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Le calendrier des séries, dans la forme exacte de celui des films.
 *
 * POURQUOI LA GRILLE S'AFFICHE MÊME VIDE
 * La première version rendait une liste, et une liste sans élément n'est rien :
 * quelqu'un qui ouvrait l'onglet sans série vue tombait sur une phrase et
 * repartait. Un mois se dessine toujours — c'est lui qui montre qu'il y a
 * quelque chose à y mettre, et le bouton de planification est juste au-dessus.
 *
 * CE QUE « PLANIFIER » VEUT DIRE ICI
 * Un film se planifie à une séance de cinéma, avec une heure et une salle. Une
 * série n'a pas d'équivalent : elle a des dates de diffusion, qui ne
 * s'inventent pas. Planifier, c'est donc suivre une série dont la prochaine
 * diffusion est annoncée — ses dates rejoignent alors le calendrier toutes
 * seules. On ne fabrique aucun rendez-vous que personne n'a pris.
 */
const TvCalendar: React.FC<Props> = ({ movies, onOpen, onPreview, onAdd }) => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const LABELS = useMemo(() => buildCalendarLabels(locale), [locale]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'heatmap'>('month');
  const [selectedDay, setSelectedDay] = useState<{ day: number; events: TvEvent[] } | null>(null);
  const [planner, setPlanner] = useState(false);
  const [upcoming, setUpcoming] = useState<TvRelease[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const series = useMemo(() => movies.filter(isSeries), [movies]);
  const followedIds = useMemo(
    () => series.flatMap((s) => (s.tmdbId == null ? [] : [s.tmdbId])),
    [series]
  );
  const idsKey = followedIds.join(',');

  /* Les diffusions annoncées sont chargées une fois pour le calendrier entier :
     changer de mois ne doit pas relancer une cinquantaine de requêtes TMDB. */
  useEffect(() => {
    let active = true;
    if (!idsKey) {
      setUpcoming([]);
      return;
    }
    getTvUpcoming(idsKey.split(',').map(Number), locale, true)
      .then((data) => {
        if (active) setUpcoming(data);
      })
      .catch(() => {
        if (active) setUpcoming([]);
      });
    return () => {
      active = false;
    };
  }, [idsKey, locale]);

  const events = useMemo<TvEvent[]>(() => {
    const list: TvEvent[] = [];

    for (const s of series) {
      const seen: TvEpisodeEntry[] = Object.values(s.tvProgress?.episodes ?? {});
      for (const episode of seen) {
        if (!episode.watched || !episode.watchedAt) continue;
        list.push({
          key: `${s.id}:${episode.seasonNumber}:${episode.episodeNumber}`,
          type: 'watched',
          kind: 'episode',
          date: episode.watchedAt,
          series: s,
          label: `S${episode.seasonNumber} · E${episode.episodeNumber}`,
          rating: episode.rating,
          posterUrl: s.posterUrl,
        });
      }
    }

    // Le verdict de saison est daté comme verdict. On ne fabrique jamais à
    // partir de lui des dates de visionnage d'épisodes qui n'ont pas été saisies.
    for (const season of movies.filter(isSeason)) {
      const parent = series.find((s) => s.tmdbId === season.seriesTmdbId);
      if (!parent || !season.dateWatched) continue;
      list.push({
        key: season.id,
        type: 'watched',
        kind: 'verdict',
        date: localDate(new Date(season.dateWatched)),
        series: parent,
        label: t('tv.seasonVerdict', { season: season.seasonNumber! }),
        posterUrl: season.posterUrl || parent.posterUrl,
      });
    }

    for (const release of upcoming) {
      const parent = series.find((s) => s.tmdbId === release.id);
      if (!parent) continue;
      list.push({
        key: `up:${release.id}:${release.season}:${release.episode ?? ''}`,
        type: 'planned',
        kind: 'airing',
        date: release.date,
        series: parent,
        label: `S${release.season}${release.episode ? ` · E${release.episode}` : ''}`,
        posterUrl: release.poster || parent.posterUrl,
      });
    }

    return list;
  }, [series, movies, upcoming, t]);

  const monthData = useMemo(() => {
    const daysMap: Record<number, TvEvent[]> = {};
    const counts = { episode: 0, verdict: 0, airing: 0 };
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    for (const event of events) {
      if (!event.date.startsWith(prefix)) continue;
      const day = Number(event.date.slice(8, 10));
      if (!Number.isInteger(day) || day < 1) continue;
      (daysMap[day] ??= []).push(event);
      counts[event.kind]++;
    }
    return { daysMap, counts, total: counts.episode + counts.verdict + counts.airing };
  }, [events, month, year]);

  const yearData = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    for (const event of events) {
      if (event.type !== 'watched' || !event.date.startsWith(`${year}-`)) continue;
      const index = Number(event.date.slice(5, 7)) - 1;
      if (index >= 0 && index < 12) counts[index]++;
    }
    return counts;
  }, [events, year]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const heatmapColor = (count: number) => {
    if (count === 0) return 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-600';
    if (count <= 4) return 'bg-lime-100 dark:bg-lime-950 text-lime-600 dark:text-lime-400';
    if (count <= 10) return 'bg-lime-300 dark:bg-lime-800 text-lime-800 dark:text-lime-200';
    return 'bg-forest dark:bg-bitter-lime text-white dark:text-charcoal';
  };

  return (
    <div className="animate-[fadeIn_0.4s_ease-out] bg-transparent -mx-6 -mt-4">
      <header className="mx-auto max-w-md px-6 pb-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">
              {viewMode === 'month' ? `${LABELS.months[month]} ${year}` : year}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-500">
              {viewMode === 'month' ? (
                <>
                  <span>{t('tv.episodesWatchedCount', { count: monthData.counts.episode })}</span>
                  {monthData.counts.verdict > 0 && (
                    <span>· {t('tv.seasonsRatedCount', { count: monthData.counts.verdict })}</span>
                  )}
                  {monthData.counts.airing > 0 && (
                    <span>· {t('tv.airingsCount', { count: monthData.counts.airing })}</span>
                  )}
                </>
              ) : (
                <span>{t('tv.eventCount', { count: yearData.reduce((a, b) => a + b, 0) })}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setViewMode((v) => (v === 'month' ? 'heatmap' : 'month'))}
            className="grid h-9 w-9 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-charcoal dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={viewMode === 'month' ? t('calendar.yearView') : t('calendar.monthView')}
          >
            {viewMode === 'month' ? <LayoutGrid size={17} /> : <CalendarDays size={17} />}
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-stone-200/70 pt-3 dark:border-white/10">
          <button
            onClick={() =>
              setCurrentDate(
                viewMode === 'month' ? new Date(year, month - 1, 1) : new Date(year - 1, month, 1)
              )
            }
            className="grid h-9 w-9 place-items-center rounded-full text-charcoal transition hover:bg-stone-100 active:scale-90 dark:text-white dark:hover:bg-white/10"
            aria-label={viewMode === 'month' ? t('calendar.previousMonth') : t('calendar.previousYear')}
          >
            <ChevronLeft size={19} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => {
              setCurrentDate(new Date());
              setViewMode('month');
            }}
            className="text-[10px] font-black uppercase tracking-[0.15em] text-stone-400 transition hover:text-charcoal dark:text-stone-500 dark:hover:text-white"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={() =>
              setCurrentDate(
                viewMode === 'month' ? new Date(year, month + 1, 1) : new Date(year + 1, month, 1)
              )
            }
            className="grid h-9 w-9 place-items-center rounded-full text-charcoal transition hover:bg-stone-100 active:scale-90 dark:text-white dark:hover:bg-white/10"
            aria-label={viewMode === 'month' ? t('calendar.nextMonth') : t('calendar.nextYear')}
          >
            <ChevronRight size={19} strokeWidth={2.5} />
          </button>
        </div>

        <button
          onClick={() => {
            haptics.soft();
            setPlanner(true);
          }}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-charcoal px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:scale-[1.02] active:scale-95 dark:bg-bitter-lime dark:text-charcoal"
        >
          <CalendarPlus size={14} /> {t('tv.planSeries')}
        </button>
      </header>

      {viewMode === 'heatmap' ? (
        <div className="px-6 pb-6">
          <div className="grid grid-cols-4 gap-3">
            {LABELS.monthsShort.map((label, i) => {
              const count = yearData[i];
              const isCurrentMonth =
                i === new Date().getMonth() && year === new Date().getFullYear();
              return (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentDate(new Date(year, i, 1));
                    setViewMode('month');
                  }}
                  className={`rounded-2xl p-3 flex flex-col items-center gap-1 transition-all active:scale-95 ${heatmapColor(count)} ${isCurrentMonth ? 'ring-2 ring-forest dark:ring-bitter-lime ring-offset-1 dark:ring-offset-[#161616]' : ''}`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
                    {label}
                  </span>
                  <span className="text-lg font-black leading-none">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-6">
          <div className="grid grid-cols-7 mb-3">
            {/* clé sur l'index : deux jours partagent la même initiale */}
            {LABELS.days.map((day, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-black text-stone-300 dark:text-stone-600 opacity-50 dark:opacity-100"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = monthData.daysMap[day] || [];
              const hasEvents = dayEvents.length > 0;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;
              return (
                <button
                  key={day}
                  onClick={() => hasEvents && setSelectedDay({ day, events: dayEvents })}
                  disabled={!hasEvents}
                  aria-label={`${day} ${LABELS.months[month]}`}
                  className={`relative aspect-square flex flex-col items-center justify-center transition-all rounded-xl ${hasEvents ? 'active:scale-95' : ''}`}
                >
                  {hasEvents ? (
                    <div className="w-full h-full p-0.5 relative">
                      {dayEvents.length > 1 && (
                        <div className="absolute inset-0 bg-white dark:bg-[#1a1a1a] rounded-xl border border-stone-200 dark:border-white/5 shadow-sm translate-x-[2px] translate-y-[2px] -z-10" />
                      )}
                      {dayEvents[0].posterUrl ? (
                        <img
                          src={resizeTmdbImage(dayEvents[0].posterUrl, 'w154')}
                          className={`w-full h-full object-cover rounded-xl shadow-md ${dayEvents[0].type === 'planned' ? 'opacity-60' : ''}`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div
                          className={`w-full h-full flex items-center justify-center rounded-xl shadow-md ${dayEvents[0].type === 'planned' ? 'bg-bitter-lime text-charcoal' : 'bg-charcoal dark:bg-forest text-white'}`}
                        >
                          {dayEvents[0].type === 'planned' ? (
                            <CalendarPlus size={16} />
                          ) : (
                            <Tv size={16} className="opacity-20" />
                          )}
                        </div>
                      )}
                      {dayEvents.length > 1 && (
                        <div className="absolute top-1 right-1 bg-charcoal dark:bg-forest text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-20 shadow-sm border border-white/20 dark:border-white/5">
                          +{dayEvents.length - 1}
                        </div>
                      )}
                      {/* Une diffusion annoncée n'est pas un épisode vu : elle
                          doit se distinguer sans ouvrir le jour. */}
                      {dayEvents.some((event) => event.type === 'planned') && (
                        <span className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-bitter-lime ring-2 ring-white dark:ring-[#1a1a1a] z-20" />
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-sm font-semibold transition-colors ${isToday ? 'text-forest dark:text-lime-500 bg-forest/10 dark:bg-lime-500/10 w-8 h-8 flex items-center justify-center rounded-full' : 'text-stone-300 dark:text-stone-600'}`}
                    >
                      {day}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {monthData.total === 0 && (
            <p className="mt-5 text-center text-[11px] font-medium leading-relaxed text-stone-400 dark:text-stone-600">
              {t('tv.emptyMonthHint')}
            </p>
          )}
        </div>
      )}

      {selectedDay && (
        <DayDetailModal
          day={selectedDay.day}
          monthName={LABELS.months[month]}
          events={selectedDay.events}
          onOpen={(s) => {
            setSelectedDay(null);
            onOpen(s);
          }}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {planner && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
          <button
            className="absolute inset-0 bg-charcoal/70 backdrop-blur-md"
            onClick={() => setPlanner(false)}
            aria-label={t('common.close')}
          />
          <section className="relative z-10 w-full sm:max-w-md max-h-[85dvh] overflow-y-auto no-scrollbar rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 bg-cream px-6 pb-8 pt-7 shadow-2xl dark:bg-[#0c0c0c]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400">
                  {t('tv.planSeries')}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-charcoal dark:text-white">
                  {t('tv.upcoming')}
                </h2>
              </div>
              <button
                onClick={() => setPlanner(false)}
                aria-label={t('common.close')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500 dark:bg-white/10"
              >
                <X size={17} />
              </button>
            </div>
            <TvUpcoming
              followedIds={followedIds}
              onPreview={(id) => onPreview?.(id)}
              onAdd={onAdd}
            />
          </section>
        </div>
      )}
    </div>
  );
};

export default TvCalendar;
