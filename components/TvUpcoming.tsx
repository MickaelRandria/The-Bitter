import React, { useEffect, useState } from 'react';
import { getTvUpcoming, TvRelease } from '../services/tv';
import { useLanguage } from '../contexts/LanguageContext';

export default function TvUpcoming({ followedIds, onPreview, onAdd }: { followedIds: number[]; onPreview: (id: number) => void; onAdd?: (id: number) => Promise<void> }) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<TvRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  const [added, setAdded] = useState<number[]>([]);
  const [filter, setFilter] = useState<'new' | 'season' | 'followed'>('new');
  const idsKey = followedIds.join(',');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    getTvUpcoming(idsKey ? idsKey.split(',').map(Number) : [], language === 'fr' ? 'fr-FR' : 'en-US')
      .then(data => { if (active) setItems(data); }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [idsKey, language, retry]);
  const visible = items.filter(item => filter === 'followed' ? followedIds.includes(item.id) : item.kind === filter);
  return <section className="space-y-4 text-charcoal dark:text-white">
    <p className="text-sm text-stone-500">{t('tv.upcomingIntro')}</p>
    <div className="flex flex-wrap gap-2">{(['new', 'season', 'followed'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-xl px-3 py-3 text-xs ${filter === key ? 'bg-forest text-white' : 'bg-stone-100 dark:bg-stone-800'}`}>{t(`tv.upcoming.${key}`)}</button>)}</div>
    {loading ? <p role="status">{t('tv.loading')}</p> : error ? <div><p>{t('tv.loadError')}</p><button className="underline py-3" onClick={() => setRetry(n => n + 1)}>{t('tv.retry')}</button></div> : !visible.length ? <p className="text-sm text-stone-500">{t('tv.noReleases')}</p> : <ul className="space-y-3">{visible.map(item => <li key={`${item.id}:${item.season}:${item.episode ?? ''}`} className="flex gap-4 p-3 rounded-2xl border border-stone-200 dark:border-white/10">
      <button onClick={() => onPreview(item.id)} className="shrink-0" aria-label={item.title}>{item.poster && <img src={item.poster} alt="" loading="lazy" className="w-20 rounded-xl" />}</button>
      <div className="flex-1"><button onClick={() => onPreview(item.id)} className="font-bold text-left">{item.title}</button><p className="text-xs mt-1">{item.kind === 'new' ? t('tv.newSeries') : `S${item.season}${item.episode ? ` · E${item.episode}` : ''}`} · {new Date(`${item.date}T12:00:00`).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}</p>
        {!!item.providers.length && <p className="text-xs text-stone-500 mt-2">{t('tv.currentPlatforms', { names: item.providers.join(', ') })}</p>}
        {onAdd && <button disabled={pending === item.id || followedIds.includes(item.id) || added.includes(item.id)} className="mt-2 text-xs font-bold py-2 disabled:opacity-50" onClick={async () => { setPending(item.id); try { await onAdd(item.id); setAdded(prev => [...prev, item.id]); } finally { setPending(null); } }}>{followedIds.includes(item.id) || added.includes(item.id) ? t('tv.inLibrary') : t('tv.addSeries')}</button>}
      </div>
    </li>)}</ul>}
  </section>;
}
