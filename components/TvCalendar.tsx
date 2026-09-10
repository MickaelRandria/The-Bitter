import React, { useEffect, useMemo, useState } from 'react';
import { Movie } from '../types';
import { getTvUpcoming, TvRelease } from '../services/tv';
import { localDate } from '../utils/tvProgress';
import { isSeries, isSeason } from '../utils/workKey';
import { useLanguage } from '../contexts/LanguageContext';

export default function TvCalendar({ movies, onOpen }: { movies: Movie[]; onOpen: (series: Movie) => void }) {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'history' | 'upcoming'>('history');
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [upcoming, setUpcoming] = useState<TvRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const series: Movie[] = useMemo(() => movies.filter(isSeries), [movies]);
  const ids = series.flatMap(s => s.tmdbId == null ? [] : [s.tmdbId]).join(',');
  useEffect(() => {
    if (mode !== 'upcoming') return;
    let active = true; setLoading(true); setError(false);
    getTvUpcoming(ids ? ids.split(',').map(Number) : [], language === 'fr' ? 'fr-FR' : 'en-US', true)
      .then(data => { if (active) setUpcoming(data); }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, ids, language, retry]);
  const history = series.flatMap(s => Object.values(s.tvProgress?.episodes ?? {}).filter(e => e.watched && e.watchedAt).map(e => ({ key: `${s.id}:${e.seasonNumber}:${e.episodeNumber}`, date: e.watchedAt!, series: s, label: `S${e.seasonNumber} · E${e.episodeNumber}`, rating: e.rating })));
  // Le verdict de saison est daté comme verdict. On ne fabrique jamais à partir
  // de lui des dates de visionnage d'épisodes qui n'ont pas été saisies.
  for (const season of movies.filter(isSeason)) {
    const parent = series.find(s => s.tmdbId === season.seriesTmdbId);
    if (parent && season.dateWatched) history.push({ key: season.id, date: localDate(new Date(season.dateWatched)), series: parent, label: t('tv.seasonVerdict', { season: season.seasonNumber! }), rating: undefined });
  }
  const events = (mode === 'history' ? history : upcoming.flatMap(e => {
    const parent = series.find(s => s.tmdbId === e.id);
    return parent ? [{ key: `${e.id}:${e.season}:${e.episode ?? ''}`, date: e.date, series: parent, label: `S${e.season}${e.episode ? ` · E${e.episode}` : ''}`, rating: undefined }] : [];
  })).filter(e => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  return <section className="max-w-lg mx-auto space-y-5 text-charcoal dark:text-white">
    <h1 className="text-2xl font-black">{t('tv.calendar')}</h1>
    <div className="flex gap-2">{(['history', 'upcoming'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`px-4 py-3 rounded-xl text-sm ${mode === value ? 'bg-forest text-white' : 'bg-stone-100 dark:bg-stone-800'}`}>{t(`tv.${value}`)}</button>)}</div>
    <label className="block text-sm">{t('tv.month')}<input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} className="block mt-2 p-3 rounded-xl bg-stone-100 dark:bg-stone-800" /></label>
    <p className="text-xs text-stone-500">{t(mode === 'history' ? 'tv.historyHint' : 'tv.upcomingHint')}</p>
    {loading && mode === 'upcoming' ? <p role="status">{t('tv.loading')}</p> : error && mode === 'upcoming' ? <div><p>{t('tv.loadError')}</p><button onClick={() => setRetry(n => n + 1)} className="underline py-3">{t('tv.retry')}</button></div> : !events.length ? <p className="py-8 text-sm text-stone-500">{t('tv.noEvents')}</p> : <ul className="space-y-3">{events.map(event => <li key={event.key}><button onClick={() => onOpen(event.series)} className="w-full text-left p-4 rounded-2xl border border-stone-200 dark:border-white/10 flex gap-4"><time dateTime={event.date} className="text-sm shrink-0">{new Date(`${event.date}T12:00:00`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</time><span><span className="block font-bold">{event.series.title}</span><span className="text-xs text-stone-500">{event.label}{event.rating != null ? ` · ${event.rating}/10` : ''}</span></span></button></li>)}</ul>}
  </section>;
}
