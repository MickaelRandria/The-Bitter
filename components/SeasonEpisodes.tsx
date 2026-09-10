import React, { useEffect, useState } from 'react';
import { Movie, TvEpisodeEntry, TvProgress } from '../types';
import { getSeasonEpisodes, TvEpisode } from '../services/tv';
import { episodeAverage, episodeKey, localDate, updateEpisode } from '../utils/tvProgress';
import { useLanguage } from '../contexts/LanguageContext';

interface Props { series: Movie; season: number; onUpdate: (progress: TvProgress) => void }

function EpisodeEditor({ entry, onSave, onClose }: { entry: TvEpisodeEntry; onSave: (entry: TvEpisodeEntry) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [rating, setRating] = useState(entry.rating == null ? '' : String(entry.rating));
  const [review, setReview] = useState(entry.review ?? '');
  const [date, setDate] = useState(entry.watchedAt ?? '');
  const valid = rating === '' || (Number.isFinite(Number(rating)) && Number(rating) >= 0 && Number(rating) <= 10);
  return <form className="mt-3 grid gap-3 rounded-xl bg-stone-50 p-3 dark:bg-black/30" onSubmit={e => { e.preventDefault(); if (!valid) return; onSave({ ...entry, rating: rating === '' ? undefined : Number(rating), review: review.trim() || undefined, watchedAt: entry.watched ? date || undefined : undefined, updatedAt: Date.now() }); onClose(); }}>
    <label className="text-xs">{t('tv.episodeRating')}<input autoFocus type="number" min="0" max="10" step="0.1" inputMode="decimal" value={rating} onChange={e => setRating(e.target.value)} placeholder="— / 10" className="mt-1 block w-full rounded-lg p-3 bg-white dark:bg-stone-800" /></label>
    <label className="text-xs">{t('tv.personalReview')}<textarea maxLength={2000} value={review} onChange={e => setReview(e.target.value)} className="mt-1 block w-full rounded-lg p-3 bg-white dark:bg-stone-800" /></label>
    {entry.watched && <label className="text-xs">{t('tv.watchedDate')}<input type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-lg p-3 bg-white dark:bg-stone-800" /></label>}
    <div className="flex gap-2"><button disabled={!valid} className="rounded-xl bg-forest text-white px-4 py-3 text-xs disabled:opacity-40">{t('tv.save')}</button><button type="button" onClick={onClose} className="px-3 py-3 text-xs">{t('tv.cancel')}</button></div>
  </form>;
}

export default function SeasonEpisodes({ series, season, onUpdate }: Props) {
  const { t, language } = useLanguage();
  const [episodes, setEpisodes] = useState<TvEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    getSeasonEpisodes(series.tmdbId!, season, language === 'fr' ? 'fr-FR' : 'en-US')
      .then(data => { if (active) setEpisodes(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [series.tmdbId, season, language, retry]);
  const progress = series.tvProgress;
  const saveEpisode = (entry: TvEpisodeEntry) => {
    // Avant de défaire une saison cochée en bloc, on matérialise les autres
    // épisodes : sans quoi décocher le troisième effacerait aussi les deux
    // premiers. Leur date reste inconnue — une coche de saison n'invente pas un
    // historique de visionnage.
    const normalized = progress?.seasonsWatched?.includes(season) ? {
      ...progress,
      episodes: { ...Object.fromEntries(episodes.map(e => [episodeKey(season, e.episodeNumber), {
        seasonNumber: season, episodeNumber: e.episodeNumber, watched: true, runtime: e.runtime, updatedAt: progress.updatedAt,
      }])), ...progress.episodes },
    } : progress;
    onUpdate(updateEpisode(normalized, entry));
  };
  const average = episodeAverage(Object.values(progress?.episodes ?? {}), season);
  if (loading) return <p role="status" className="py-4 text-xs">{t('tv.loading')}</p>;
  if (error) return <div className="py-3 text-xs"><p>{t('tv.loadError')}</p><button className="py-3 underline" onClick={() => setRetry(n => n + 1)}>{t('tv.retry')}</button></div>;
  return <div className="mt-3 border-t border-stone-200 dark:border-white/10 pt-3">
    {average && <p className="mb-3 text-xs text-stone-500">{t('tv.episodeAverage', { rating: average.average.toFixed(1), count: average.count, total: episodes.length })}</p>}
    {!episodes.length && <p className="text-xs">{t('tv.noEpisodes')}</p>}
    <ul className="space-y-2">{episodes.map(episode => {
      const key = episodeKey(season, episode.episodeNumber);
      const entry: TvEpisodeEntry = progress?.episodes?.[key] ?? { seasonNumber: season, episodeNumber: episode.episodeNumber, watched: progress?.seasonsWatched?.includes(season) ?? false, runtime: episode.runtime, updatedAt: 0 };
      const visible = entry.watched || revealed.includes(episode.id);
      return <li key={episode.id} className="rounded-xl border border-stone-200 dark:border-white/10 p-3 text-charcoal dark:text-white">
        <div className="flex items-center gap-2">
          <button aria-label={t(entry.watched ? 'tv.markUnseen' : 'tv.markSeen', { episode: episode.episodeNumber })} aria-pressed={entry.watched} onClick={() => saveEpisode({ ...entry, runtime: episode.runtime, watched: !entry.watched, watchedAt: entry.watched ? undefined : localDate(), updatedAt: Date.now() })} className={`min-w-11 min-h-11 rounded-xl border ${entry.watched ? 'bg-forest text-white border-forest' : 'border-stone-300 dark:border-white/20'}`}>{entry.watched ? '✓' : '○'}</button>
          <div className="flex-1 min-w-0"><p className="text-xs font-bold">{t('tv.episode', { number: episode.episodeNumber })}</p>{visible ? <p className="text-xs text-stone-500 break-words">{episode.name}</p> : <button onClick={() => setRevealed(prev => [...prev, episode.id])} className="text-xs text-stone-500 underline py-2">{t('tv.revealTitle')}</button>}</div>
          <button aria-label={t('tv.rateEpisode', { number: episode.episodeNumber })} onClick={() => setEditing(editing === episode.id ? null : episode.id)} className="min-h-11 px-3 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold">{entry.rating == null ? t('tv.rate') : `${entry.rating}/10`}</button>
        </div>
        {editing === episode.id && <EpisodeEditor entry={entry} onClose={() => setEditing(null)} onSave={saveEpisode} />}
      </li>;
    })}</ul>
  </div>;
}
