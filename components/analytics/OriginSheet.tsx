import React, { useMemo } from 'react';
import ActionSheet from '../ActionSheet';
import type { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';

/**
 * Un pays ou une langue de « Tes pays et tes langues » : ta moyenne face à la
 * tienne en général, tes meilleurs films, ses réalisateurs et ses genres chez
 * toi, et combien tu en vois chaque année.
 */
interface Props {
  title: string;
  /** Tes films vus de ce pays (ou dans cette langue). */
  films: Movie[];
  overallAverage: number;
  onViewMovie?: (movie: Movie) => void;
  onClose: () => void;
}

const card = 'rounded-[22px] border border-sand bg-white p-4 dark:border-white/[0.08] dark:bg-[#1C1B19]';

const Head: React.FC<{ title: string; aside?: string }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[17px] font-black tracking-[-0.035em] text-charcoal dark:text-white">{title}</h3>
    {aside && <small className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{aside}</small>}
  </div>
);

function tally<T extends string | number>(films: Movie[], keyOf: (m: Movie) => T | undefined) {
  const map = new Map<T, { n: number; sum: number }>();
  for (const m of films) {
    const key = keyOf(m);
    if (key == null || key === '') continue;
    const row = map.get(key) ?? { n: 0, sum: 0 };
    row.n += 1;
    row.sum += getDisplayWeightedRating(m);
    map.set(key, row);
  }
  return [...map.entries()].map(([key, r]) => ({ key, count: r.n, average: r.sum / r.n }));
}

export default function OriginSheet({ title, films, overallAverage, onViewMovie, onClose }: Props) {
  const { t } = useLanguage();
  const sorted = useMemo(() => [...films].sort((a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a)), [films]);
  const avg = films.length ? films.reduce((s, m) => s + getDisplayWeightedRating(m), 0) / films.length : 0;
  const directors = useMemo(() => tally(films, (m) => m.director).sort((a, b) => b.count - a.count || b.average - a.average).slice(0, 4), [films]);
  const genres = useMemo(() => tally(films, (m) => m.genre).sort((a, b) => b.count - a.count).slice(0, 6), [films]);
  const years = useMemo(
    () => tally(films, (m) => new Date(m.dateWatched || m.dateAdded).getFullYear()).sort((a, b) => a.key - b.key).slice(-6),
    [films]
  );
  const maxYear = Math.max(1, ...years.map((y) => y.count));

  return (
    <ActionSheet title={title} subtitle={t('origin.subtitle', { n: String(films.length) })} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section className={card}>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-charcoal p-3 text-white dark:bg-white dark:text-charcoal">
              <small className="block truncate text-[10px] font-black uppercase tracking-[0.12em] text-bitter-lime dark:text-forest">{title}</small>
              <b className="mt-1 block text-[32px] font-black tracking-[-0.06em]">{fmt1(avg)}</b>
            </div>
            <div className="rounded-2xl bg-sand p-3 dark:bg-white/[0.06]">
              <small className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{t('origin.overall')}</small>
              <b className="mt-1 block text-[32px] font-black tracking-[-0.06em] text-charcoal dark:text-white">{fmt1(overallAverage)}</b>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <Head title={t('origin.best')} />
          <div className="grid grid-cols-3 gap-2.5">
            {sorted.slice(0, 3).map((m) => (
              <button key={m.id} type="button" onClick={() => onViewMovie?.(m)} className="flex min-w-0 flex-col gap-1 text-left active:scale-[0.97]">
                {m.posterUrl ? (
                  <img src={resizeTmdbImage(m.posterUrl, 'w185')} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
                ) : (
                  <span className="block aspect-[2/3] w-full rounded-xl bg-sand dark:bg-white/10" />
                )}
                <b className="truncate text-[12px] font-black text-charcoal dark:text-white">{m.title}</b>
                <small className="-mt-1 text-[11px] font-black text-forest dark:text-bitter-lime">{fmt1(getDisplayWeightedRating(m))}</small>
              </button>
            ))}
          </div>
        </section>

        {directors.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('origin.directors')} />
            <ul className={`${card} py-1`}>
              {directors.map((d, i) => (
                <li key={d.key} className={`flex justify-between gap-3 py-2.5 ${i ? 'border-t border-sand dark:border-white/10' : ''}`}>
                  <b className="truncate text-[13px] font-black text-charcoal dark:text-white">{d.key}</b>
                  <small className="shrink-0 text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
                    {t('gouts.films', { n: String(d.count) })} · {fmt1(d.average)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {genres.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('origin.genres')} />
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g, i) => (
                <span key={g.key} className={`rounded-full px-2.5 py-1.5 text-[11px] font-black ${i === 0 ? 'bg-bitter-lime text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'}`}>
                  {g.key} <span className="opacity-60">{g.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {years.length > 1 && (
          <section className="flex flex-col gap-2.5">
            <Head title={t('origin.years')} />
            <div className={`${card} flex h-[120px] items-end gap-2`} aria-hidden="true">
              {years.map((y) => (
                <div key={y.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className={`w-full rounded-md ${y.count === maxYear ? 'bg-bitter-lime' : 'bg-stone-300 dark:bg-white/15'}`}
                    style={{ height: `${Math.max(4, (y.count / maxYear) * 70)}px` }}
                  />
                  <b className="text-[10px] font-black text-charcoal dark:text-white">{y.key}</b>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ActionSheet>
  );
}
