import React, { useMemo } from 'react';
import ActionSheet from '../ActionSheet';
import type { Movie } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';

/**
 * Un pays ou une langue de « Tes pays et tes langues » : ta moyenne face à la
 * tienne en général, tes meilleurs films, et ses réalisateurs et ses genres
 * parmi tes films. Une rangée en tête passe d'un pays (ou d'une langue) à l'autre.
 */
interface Choice {
  key: string;
  label: string;
  count: number;
}

interface Props {
  /** Le pays ou la langue ouvert. */
  current: string;
  choices: Choice[];
  onSwitch: (key: string) => void;
  /** Tes films vus de ce pays (ou dans cette langue). */
  films: Movie[];
  overallAverage: number;
  onViewMovie?: (movie: Movie) => void;
  onClose: () => void;
}

const card = 'rounded-[22px] border border-sand bg-white p-4 dark:border-white/[0.08] dark:bg-[#1C1B19]';

const Head: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="px-1 text-[17px] font-black tracking-[-0.035em] text-charcoal dark:text-white">{title}</h3>
);

function tally(films: Movie[], keyOf: (m: Movie) => string | undefined) {
  const map = new Map<string, { n: number; sum: number }>();
  for (const m of films) {
    const key = keyOf(m);
    if (!key) continue;
    const row = map.get(key) ?? { n: 0, sum: 0 };
    row.n += 1;
    row.sum += getDisplayWeightedRating(m);
    map.set(key, row);
  }
  return [...map.entries()].map(([key, r]) => ({ key, count: r.n, average: r.sum / r.n }));
}

export default function OriginSheet({ current, choices, onSwitch, films, overallAverage, onViewMovie, onClose }: Props) {
  const { t } = useLanguage();
  const name = choices.find((c) => c.key === current)?.label ?? current;
  const sorted = useMemo(() => [...films].sort((a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a)), [films]);
  const avg = films.length ? films.reduce((s, m) => s + getDisplayWeightedRating(m), 0) / films.length : 0;
  const directors = useMemo(() => tally(films, (m) => m.director).sort((a, b) => b.count - a.count || b.average - a.average).slice(0, 4), [films]);
  const genres = useMemo(() => tally(films, (m) => m.genre).sort((a, b) => b.count - a.count).slice(0, 6), [films]);

  return (
    <ActionSheet title={name} subtitle={t('origin.subtitle', { n: String(films.length) })} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-6">
        {choices.length > 1 && (
          <div className="-mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label={t('origin.switch')}>
            {choices.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={c.key === current}
                onClick={() => {
                  haptics.soft();
                  onSwitch(c.key);
                }}
                className={`h-8 max-w-full truncate rounded-full px-3 text-[11px] font-black ${
                  c.key === current ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'
                }`}
              >
                {c.label} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        )}

        <section className={card}>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
            <div className="min-w-0 rounded-2xl bg-charcoal p-3 text-white dark:bg-white dark:text-charcoal">
              <small className="block truncate text-[10px] font-black uppercase tracking-[0.12em] text-bitter-lime dark:text-forest">{name}</small>
              <b className="mt-1 block text-[32px] font-black tracking-[-0.06em]">{fmt1(avg)}</b>
            </div>
            <div className="min-w-0 rounded-2xl bg-sand p-3 dark:bg-white/[0.06]">
              <small className="block truncate text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{t('origin.overall')}</small>
              <b className="mt-1 block text-[32px] font-black tracking-[-0.06em] text-charcoal dark:text-white">{fmt1(overallAverage)}</b>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2.5">
          <Head title={t('origin.best', { name })} />
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2.5">
            {sorted.slice(0, 3).map((m) => (
              <button key={m.id} type="button" onClick={() => onViewMovie?.(m)} className="flex w-full min-w-0 flex-col gap-1 overflow-hidden text-left active:scale-[0.97]">
                {m.posterUrl ? (
                  <img src={resizeTmdbImage(m.posterUrl, 'w185')} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
                ) : (
                  <span className="block aspect-[2/3] w-full rounded-xl bg-sand dark:bg-white/10" />
                )}
                <b className="block w-full truncate text-[12px] font-black text-charcoal dark:text-white">{m.title}</b>
                <small className="-mt-1 block text-[11px] font-black text-forest dark:text-bitter-lime">{fmt1(getDisplayWeightedRating(m))}</small>
              </button>
            ))}
          </div>
        </section>

        {directors.length > 0 && (
          <section className="flex min-w-0 flex-col gap-2.5">
            <Head title={t('origin.directors', { name })} />
            <ul className={`${card} py-1`}>
              {directors.map((d, i) => (
                <li key={d.key} className={`flex min-w-0 justify-between gap-3 py-2.5 ${i ? 'border-t border-sand dark:border-white/10' : ''}`}>
                  <b className="min-w-0 truncate text-[13px] font-black text-charcoal dark:text-white">{d.key}</b>
                  <small className="shrink-0 text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
                    {t('gouts.films', { n: String(d.count) })} · {fmt1(d.average)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {genres.length > 0 && (
          <section className="flex min-w-0 flex-col gap-2.5">
            <Head title={t('origin.genres', { name })} />
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g, i) => (
                <span key={g.key} className={`max-w-full truncate rounded-full px-2.5 py-1.5 text-[11px] font-black ${i === 0 ? 'bg-bitter-lime text-charcoal' : 'bg-sand text-charcoal dark:bg-white/10 dark:text-white'}`}>
                  {g.key} <span className="opacity-60">{g.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </ActionSheet>
  );
}
