import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Movie, UserProfile } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { getDisplayWeightedRating } from '../../utils/rating';
import { getPublicRating } from '../../utils/publicRating';
import { countMoviesWithImprints, MIN_MOVIES_FOR_IMPRINTS } from '../../utils/movieStats';
import { cinemaArchetype } from '../../utils/cinemaPortrait';
import { fmt1 } from '../../utils/verdict';
import { PORTRAIT_MIN_MOVIES } from '../TastePortrait';

/**
 * Les stats d'un compte qui débute (moins de `unlockAt` films vus) : au lieu
 * d'un écran fermé, un archétype provisoire dès le premier film, trois chiffres,
 * et ce que les stats vont révéler, étape par étape, chacune avec son geste.
 */
interface Props {
  movies: Movie[];
  userProfile: UserProfile | null;
  /** Films vus pour ouvrir les stats complètes. */
  unlockAt: number;
  onRateFilm?: () => void;
  onOpenSpaces?: () => void;
}

const Step: React.FC<{
  done: boolean;
  title: string;
  sub: string;
  progress?: number;
  cta?: string;
  onCta?: () => void;
}> = ({ done, title, sub, progress, cta, onCta }) => (
  <li className="flex gap-3 border-t border-sand py-3 first:border-t-0 dark:border-white/10">
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${done ? 'bg-bitter-lime text-charcoal' : 'border-2 border-sand dark:border-white/15'}`}
    >
      {done && <Check size={14} strokeWidth={3.4} />}
    </span>
    <span className="min-w-0 flex-1">
      <b className={`block text-[14px] font-black ${done ? 'text-stone-400 line-through' : 'text-charcoal dark:text-white'}`}>{title}</b>
      <small className="mt-0.5 block text-[12px] font-semibold text-stone-500 dark:text-stone-400">{sub}</small>
      {progress != null && !done && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sand dark:bg-white/10">
          <span className="block h-full rounded-full bg-charcoal dark:bg-white" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </span>
    {cta && onCta && !done && (
      <button
        type="button"
        onClick={() => {
          haptics.soft();
          onCta();
        }}
        className="h-[34px] shrink-0 self-center whitespace-nowrap rounded-full bg-charcoal px-3 text-[11px] font-black text-white active:scale-95 dark:bg-white dark:text-charcoal"
      >
        {cta}
      </button>
    )}
  </li>
);

export default function StatsOnboarding({ movies, userProfile, unlockAt, onRateFilm, onOpenSpaces }: Props) {
  const { t } = useLanguage();
  const watched = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const n = watched.length;
  const archetype = useMemo(() => (n ? cinemaArchetype(watched, userProfile) : null), [watched, n, userProfile]);
  const scores = watched.map(getDisplayWeightedRating);
  const avg = n ? scores.reduce((a, b) => a + b, 0) / n : 0;
  const withPublic = watched.map((m) => [getDisplayWeightedRating(m), getPublicRating(m)?.value] as const).filter(([, p]) => typeof p === 'number');
  const vsPublic = withPublic.length ? withPublic.reduce((sum, [mine, pub]) => sum + mine - (pub as number), 0) / withPublic.length : null;
  const imprints = countMoviesWithImprints(watched);
  const best = [...watched].sort((a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a))[0];
  const bestPublic = best ? getPublicRating(best)?.value : undefined;
  const left = Math.max(0, unlockAt - n);

  const steps = [
    { done: n >= 1, title: t('onboard.numbers'), sub: t('onboard.numbersSub') },
    { done: n >= unlockAt, title: t('onboard.profile'), sub: t(left > 1 ? 'onboard.leftMany' : 'onboard.leftOne', { n: String(left) }), progress: n / unlockAt, cta: t('onboard.rate'), onCta: onRateFilm },
    { done: n >= PORTRAIT_MIN_MOVIES, title: t('onboard.portrait'), sub: t('onboard.portraitSub', { n: String(PORTRAIT_MIN_MOVIES) }), progress: n / PORTRAIT_MIN_MOVIES },
    { done: imprints >= MIN_MOVIES_FOR_IMPRINTS, title: t('onboard.dna'), sub: t('onboard.dnaSub', { n: String(MIN_MOVIES_FOR_IMPRINTS), done: String(imprints) }), progress: imprints / MIN_MOVIES_FOR_IMPRINTS },
    { done: false, title: t('onboard.friends'), sub: t('onboard.friendsSub'), cta: t('onboard.invite'), onCta: onOpenSpaces },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6 animate-[fadeIn_0.4s_ease-out]">
      {archetype && best ? (
        <section className="dark relative h-[250px] overflow-hidden rounded-[28px] bg-[#111] text-white">
          {best.posterUrl && (
            <img src={resizeTmdbImage(best.posterUrl, 'w500')} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%] blur-[2px]" />
          )}
          <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.3),rgba(10,10,10,0.92))]" />
          <span className="absolute right-4 top-4 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black tracking-[0.1em]">{t('onboard.provisional')}</span>
          <div className="absolute inset-x-5 bottom-[18px]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/75">{t(n > 1 ? 'onboard.fromMany' : 'onboard.fromOne', { n: String(n) })}</p>
            <h2 className="mt-1 text-[38px] font-black leading-[0.9] tracking-[-0.065em]">{archetype.title}</h2>
            <p className="mt-2 text-[12px] font-bold text-white/75">{t(left > 1 ? 'onboard.confirmMany' : 'onboard.confirmOne', { n: String(left) })}</p>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-sand bg-white p-6 text-center dark:border-white/10 dark:bg-[#1C1B19]">
          <h2 className="text-[22px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{t('onboard.emptyTitle')}</h2>
          <p className="mt-2 text-[13px] font-semibold text-stone-500 dark:text-stone-400">{t('onboard.emptySub')}</p>
        </section>
      )}

      {n > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            [String(n), t('onboard.kpiFilms'), ''],
            [fmt1(avg), t('onboard.kpiAvg'), ''],
            [vsPublic == null ? '–' : `${vsPublic > 0 ? '+' : vsPublic < 0 ? '−' : ''}${fmt1(Math.abs(vsPublic))}`, t('onboard.kpiPublic'), vsPublic != null && vsPublic > 0 ? 'text-forest dark:text-bitter-lime' : vsPublic != null && vsPublic < 0 ? 'text-[#C2630F] dark:text-[#F08A24]' : ''],
          ].map(([value, label, tone]) => (
            <div key={label} className="rounded-[18px] border border-sand bg-white p-3 dark:border-white/10 dark:bg-[#1C1B19]">
              <b className={`block text-[24px] font-black tracking-[-0.05em] text-charcoal dark:text-white ${tone}`}>{value}</b>
              <small className="text-[9px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{label}</small>
            </div>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-[19px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{t('onboard.title')}</h3>
          <small className="text-[11px] font-extrabold text-stone-500">{t('onboard.count', { done: String(doneCount), total: String(steps.length) })}</small>
        </div>
        <ul className="rounded-[24px] border border-sand bg-white px-4 py-1 dark:border-white/10 dark:bg-[#1C1B19]">
          {steps.map((step) => (
            <Step key={step.title} {...step} />
          ))}
        </ul>
      </section>

      {best && typeof bestPublic === 'number' && (
        <section className="flex flex-col gap-3">
          <h3 className="px-1 text-[19px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{t('onboard.meanwhile')}</h3>
          <div className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-3.5 dark:border-white/10 dark:bg-[#1C1B19]">
            {best.posterUrl && <img src={resizeTmdbImage(best.posterUrl, 'w154')} alt="" className="h-[78px] w-[52px] rounded-lg object-cover" />}
            <div className="min-w-0">
              <b className="block text-[14px] font-black text-charcoal dark:text-white">{t('onboard.bestTitle', { title: best.title, note: fmt1(getDisplayWeightedRating(best)) })}</b>
              <p className="mt-0.5 text-[12px] font-semibold text-stone-500 dark:text-stone-400">
                {t(getDisplayWeightedRating(best) >= bestPublic ? 'onboard.bestKinder' : 'onboard.bestHarsher', { pub: fmt1(bestPublic) })}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
