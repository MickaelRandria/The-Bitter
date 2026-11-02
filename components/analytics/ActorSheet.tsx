import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ActionSheet from '../ActionSheet';
import type { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage, tmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';
import { getPublicRating, pickFromLookup } from '../../utils/publicRating';
import { useImdbRatings } from '../../services/imdb';
import { getActorMovies, searchPerson } from '../../services/tmdb';

/**
 * Un acteur, comme un réalisateur : « Ses meilleurs films » (ses rôles les
 * mieux notés, chez TMDB) et « Tes films avec lui » (ceux que tu as notés).
 */
interface Props {
  name: string;
  personId?: number;
  photoPath?: string | null;
  /** Tes films vus avec lui. */
  films: Movie[];
  /** Ta moyenne sur tous tes films, pour dire l'écart. */
  overallAverage: number;
  onViewMovie?: (movie: Movie) => void;
  onPreview?: (tmdbId: number) => void;
  onClose: () => void;
}

type Tab = 'best' | 'mine';

export default function ActorSheet({ name, personId, photoPath, films, overallAverage, onViewMovie, onPreview, onClose }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const [tab, setTab] = useState<Tab>('best');
  const [credits, setCredits] = useState<any[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const id = personId ?? (await searchPerson(name)) ?? undefined;
      const list = id ? await getActorMovies(id) : [];
      if (alive) setCredits(list);
    })().catch(() => alive && setCredits([]));
    return () => {
      alive = false;
    };
  }, [name, personId]);

  const imdb = useImdbRatings((credits ?? []).map((m) => ({ mediaType: 'movie' as const, tmdbId: m.id })), 'low');
  const mine = useMemo(() => [...films].sort((a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a)), [films]);
  const avg = mine.length ? mine.reduce((s, m) => s + getDisplayWeightedRating(m), 0) / mine.length : 0;
  const gap = avg - overallAverage;
  const byTmdb = useMemo(() => new Map(films.filter((m) => m.tmdbId != null).map((m) => [m.tmdbId as number, m])), [films]);

  return (
    <ActionSheet title={name} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="-mt-2 flex items-center gap-3.5">
          <span className="flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest text-[28px] font-black text-white">
            {photoPath ? <img src={tmdbImage(photoPath, 'w185')} alt="" className="h-full w-full object-cover" /> : name[0]}
          </span>
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-sand p-2.5 dark:bg-white/[0.06]">
              <b className="block text-[20px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{films.length}</b>
              <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('actor.seen')}</small>
            </div>
            <div className="rounded-[14px] bg-bitter-lime p-2.5 text-charcoal">
              <b className="block text-[20px] font-black tracking-[-0.04em]">{fmt1(avg)}</b>
              <small className="text-[10px] font-extrabold">{t('actor.yourAverage')}</small>
            </div>
          </div>
        </div>

        <div role="tablist" className="flex rounded-full bg-sand p-1 dark:bg-white/[0.06]">
          {(['best', 'mine'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                haptics.soft();
                setTab(key);
              }}
              className={`h-10 flex-1 rounded-full text-[12px] font-black ${tab === key ? 'bg-white text-charcoal shadow-sm dark:bg-[#2a2a2a] dark:text-white' : 'text-stone-500 dark:text-stone-400'}`}
            >
              {t(key === 'best' ? 'actor.best' : 'actor.mine')}
            </button>
          ))}
        </div>

        {tab === 'best' ? (
          credits == null ? (
            <div className="flex justify-center py-10 text-stone-400">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : credits.length === 0 ? (
            <p className="py-8 text-center text-[13px] font-semibold text-stone-500">{t('actor.none')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
              {credits.map((c) => {
                const seen = byTmdb.get(c.id);
                const pub = pickFromLookup(imdb, 'movie', c.id, c.vote_average);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      haptics.soft();
                      if (seen) onViewMovie?.(seen);
                      else onPreview?.(c.id);
                    }}
                    className="flex min-w-0 flex-col gap-1 text-left active:scale-[0.97]"
                  >
                    <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-sand dark:bg-white/10">
                      {c.poster_path && <img src={tmdbImage(c.poster_path, 'w185')} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      {seen && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-bitter-lime px-1.5 py-0.5 text-[9px] font-black text-charcoal">
                          {fmt1(getDisplayWeightedRating(seen))}
                        </span>
                      )}
                    </span>
                    <b className="truncate text-[12px] font-black text-charcoal dark:text-white">{c.title}</b>
                    <small className="-mt-1 text-[10px] font-extrabold text-stone-500 dark:text-stone-400">
                      {[c.release_date?.slice(0, 4), pub ? `${pub.source === 'imdb' ? 'IMDb' : 'TMDB'} ${pub.value.toFixed(1)}` : ''].filter(Boolean).join(' · ')}
                    </small>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <>
            <ul className="rounded-[22px] border border-sand bg-white px-4 py-1 dark:border-white/[0.08] dark:bg-[#1C1B19]">
              {mine.map((m, i) => {
                const pub = getPublicRating(m)?.value;
                const when = m.dateWatched || m.dateAdded;
                return (
                  <li key={m.id} className={i ? 'border-t border-sand dark:border-white/10' : ''}>
                    <button type="button" onClick={() => onViewMovie?.(m)} className="flex w-full items-center gap-3 py-2.5 text-left">
                      {m.posterUrl ? (
                        <img src={resizeTmdbImage(m.posterUrl, 'w92')} alt="" className="h-[54px] w-9 rounded-md object-cover" />
                      ) : (
                        <span className="h-[54px] w-9 rounded-md bg-sand dark:bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-black text-charcoal dark:text-white">{m.title}</b>
                        <small className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                          {[
                            when ? t('actor.seenOn', { date: new Date(when).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '',
                            typeof pub === 'number' ? t('actor.public', { v: fmt1(pub) }) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      <b className="text-[16px] font-black text-charcoal dark:text-white">{fmt1(getDisplayWeightedRating(m))}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
            {mine.length >= 2 && Math.abs(gap) >= 0.2 && (
              <p className="text-[12px] font-bold text-stone-500 dark:text-stone-400">
                {t(gap > 0 ? 'actor.above' : 'actor.below', { gap: fmt1(Math.abs(gap)) })}
              </p>
            )}
          </>
        )}
      </div>
    </ActionSheet>
  );
}
