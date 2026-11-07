import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Heart, Loader2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { btnClose, btnSecondary, chip, sectionLabel } from '../utils/ui';
import {
  FilmLookup,
  PublicReview,
  ReviewList,
  ReviewOrder,
  compactCount,
  fetchBlueskyReviews,
  knownTranslation,
  translateReview,
} from '../services/publicReviews';

/**
 * Les avis du public, tels que validés sur maquette le 7 novembre 2026 :
 * commentaires YouTube d'une bande-annonce (fil des Trailers) et posts Bluesky
 * sur la fiche d'un film. Toutes langues, « Traduire » au tap, et une pastille
 * pour ne garder que la langue de l'app.
 *
 * L'auteur et le lien vers l'avis d'origine restent toujours visibles.
 */

const PAGE = 10;
const FIRST = 3;

type Loader = (order: ReviewOrder) => Promise<ReviewList>;

const localeOf = (language: string) => (language === 'en' ? 'en-GB' : 'fr-FR');

/** « Traduit de l’anglais », « Traduit du portugais », « Translated from English ». */
export function translatedFrom(source: string, language: 'fr' | 'en', t: (k: string, p?: Record<string, string | number>) => string) {
  let name = '';
  try {
    name = source && source !== 'und' ? new Intl.DisplayNames([localeOf(language)], { type: 'language' }).of(source) ?? '' : '';
  } catch {
    name = '';
  }
  if (!name || name === source) return t('reviews.translated');
  if (language === 'en') return t('reviews.translatedFrom', { lang: name });
  const article = /^[aeiouyhàâéèêëîïôöûü]/i.test(name) ? 'de l’' : 'du ';
  return t('reviews.translatedFrom', { lang: `${article}${name}` });
}

const ago = (iso: string, language: string) => {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60_000));
  const rtf = new Intl.RelativeTimeFormat(localeOf(language), { numeric: 'auto' });
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.round(months / 12), 'year');
};

/* -------------------------------------------------------------- Une carte */

const ReviewCard: React.FC<{ review: PublicReview; compact?: boolean }> = ({ review, compact = false }) => {
  const { t, language } = useLanguage();
  const target = language === 'en' ? 'en' : 'fr';
  const foreign = review.lang !== target;
  const [translation, setTranslation] = useState(() => (foreign ? knownTranslation(review.id, target) : null));
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const translate = async () => {
    haptics.soft();
    if (translation) {
      setShowOriginal(false);
      return;
    }
    setBusy(true);
    setFailed(false);
    const result = await translateReview(review, target);
    setBusy(false);
    if (result) setTranslation(result);
    else setFailed(true);
  };

  const shown = translation && !showOriginal ? translation.text : review.text;
  const when = ago(review.at, language);
  const source = review.source === 'youtube' ? 'YouTube' : 'Bluesky';

  return (
    <article
      className={`flex flex-col gap-2 rounded-2xl border border-stone-100 bg-stone-50 p-4 text-left dark:border-white/10 dark:bg-white/[0.06] ${
        compact ? 'w-[260px] shrink-0' : 'w-full'
      }`}
    >
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-[11px] font-black text-stone-500 dark:bg-[#2a2a2a] dark:text-stone-300">
          {review.avatar ? (
            <img src={review.avatar} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            review.author.charAt(0).toUpperCase()
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11px] font-black text-charcoal dark:text-white">{review.author}</span>
          {review.handle && review.source === 'bluesky' && (
            <span className="truncate text-[10px] font-semibold text-stone-500 dark:text-stone-400">{review.handle}</span>
          )}
        </span>
      </header>

      <p className={`text-[12px] font-medium leading-relaxed text-stone-600 dark:text-stone-200 ${compact ? 'line-clamp-5' : ''}`} lang={translation && !showOriginal ? target : review.lang !== 'und' ? review.lang : undefined}>
        {shown}
      </p>

      {foreign && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {translation && !showOriginal ? (
            <>
              <span className="text-[10px] font-extrabold text-forest dark:text-lime-400">{translatedFrom(translation.source, target, t)}</span>
              <button type="button" onClick={() => setShowOriginal(true)} className="text-[10px] font-extrabold text-stone-500 underline underline-offset-2 dark:text-stone-400">
                {t('reviews.original')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={translate}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-300 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-forest transition active:scale-95 disabled:opacity-60 dark:border-white/15 dark:text-bitter-lime"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              {t('reviews.translate')}
            </button>
          )}
          {failed && <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">{t('reviews.translateFailed')}</span>}
        </div>
      )}

      <footer className="mt-auto flex items-center gap-2 text-[10px] font-extrabold text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1">
          <Heart size={10} fill="currentColor" />
          {compactCount(review.likes, localeOf(language))}
        </span>
        {when && <span>· {when}</span>}
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-[28px] items-center gap-1 uppercase tracking-[0.1em] hover:text-charcoal dark:hover:text-white"
          aria-label={t('reviews.openOn', { source })}
        >
          {source}
          <ExternalLink size={10} />
        </a>
      </footer>
    </article>
  );
}

/* ------------------------------------------------------- Tri et filtres */

interface Filters {
  order: ReviewOrder;
  criteria: boolean;
  mine: boolean;
}

function useReviews(load: Loader, enabled = true) {
  const [filters, setFilters] = useState<Filters>({ order: 'relevance', criteria: false, mine: false });
  const [lists, setLists] = useState<Partial<Record<ReviewOrder, ReviewList>>>({});
  const list = lists[filters.order];
  // Le fil des Trailers se redessine à chaque pas de la barre de progression :
  // la fonction de chargement change à chaque fois, la liste ne doit pas.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const order = filters.order;
    if (!enabled || lists[order]) return;
    let alive = true;
    loadRef.current(order).then((result) => {
      if (alive) setLists((prev) => ({ ...prev, [order]: result }));
    });
    return () => {
      alive = false;
    };
    // `lists` est lu, pas suivi : une liste arrivée ne relance rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filters.order]);

  return { filters, setFilters, list, loading: enabled && !list };
}

const ReviewChips: React.FC<{ filters: Filters; onChange: (f: Filters) => void }> = ({ filters, onChange }) => {
  const { t } = useLanguage();
  const set = (patch: Partial<Filters>) => {
    haptics.soft();
    onChange({ ...filters, ...patch });
  };
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 no-scrollbar" role="group" aria-label={t('reviews.sort')}>
      <button type="button" aria-pressed={filters.order === 'relevance'} onClick={() => set({ order: 'relevance' })} className={chip(filters.order === 'relevance')}>
        {t('reviews.relevant')}
      </button>
      <button type="button" aria-pressed={filters.order === 'recent'} onClick={() => set({ order: 'recent' })} className={chip(filters.order === 'recent')}>
        {t('reviews.recent')}
      </button>
      <button type="button" aria-pressed={filters.criteria} onClick={() => set({ criteria: !filters.criteria })} className={chip(filters.criteria)}>
        {t('reviews.critics')}
      </button>
      <button type="button" aria-pressed={filters.mine} onClick={() => set({ mine: !filters.mine })} className={chip(filters.mine)}>
        {t('reviews.mine')}
      </button>
    </div>
  );
}

const applyFilters = (items: PublicReview[], filters: Filters, target: string) =>
  items.filter((r) => (!filters.criteria || r.criteria.length > 0) && (!filters.mine || r.lang === target));

/* -------------------------------------------------------------- La feuille */

interface SheetProps {
  title: string;
  kicker: string;
  load: Loader;
  /** « 2 314 commentaires sur YouTube » : le total vient de la liste. */
  countLabel: (list: ReviewList | undefined) => string;
  moreUrl?: string;
  moreLabel?: string;
  /** Au-dessus du fil des Trailers, toujours sombre. */
  dark?: boolean;
  onClose: () => void;
}

export const PublicReviewsSheet: React.FC<SheetProps> = ({ title, kicker, load, countLabel, moreUrl, moreLabel, dark = false, onClose }) => {
  const { t, language } = useLanguage();
  const target = language === 'en' ? 'en' : 'fr';
  const { filters, setFilters, list, loading } = useReviews(load);
  const [shown, setShown] = useState(FIRST);
  const visible = useMemo(() => applyFilters(list?.items ?? [], filters, target), [list, filters, target]);

  useEffect(() => setShown(FIRST), [filters]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className={`${dark ? 'dark' : ''} fixed inset-0 z-[120] flex items-end justify-center sm:items-center`} role="dialog" aria-modal="true" aria-label={kicker}>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[78dvh] w-full flex-col rounded-t-[2.5rem] bg-cream text-charcoal shadow-2xl animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] dark:bg-[#111] dark:text-white sm:max-w-md sm:rounded-[2.5rem]">
        <span className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-stone-300 dark:bg-white/20" />
        <div className="flex shrink-0 items-start gap-3 px-5 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-forest dark:text-bitter-lime">{kicker}</p>
            <h2 className="mt-1.5 line-clamp-2 text-[20px] font-black leading-[1.05] tracking-[-0.04em]">{title}</h2>
            <p className="mt-1.5 text-[11px] font-bold text-stone-500 dark:text-white/60">{countLabel(list)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className={btnClose}>
            <X size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="shrink-0 px-5 pt-3.5">
          <ReviewChips filters={filters} onChange={setFilters} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3.5 no-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-stone-400 dark:text-white/40" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-[13px] font-semibold text-stone-500 dark:text-white/60">
              {list?.disabled ? t('reviews.disabled') : filters.mine || filters.criteria ? t('reviews.noneFiltered') : t('reviews.none')}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {visible.slice(0, shown).map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}

          {visible.length > shown && (
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                setShown((n) => n + PAGE);
              }}
              className={`${btnSecondary} mt-3.5 w-full`}
            >
              {t('reviews.more', { n: Math.min(PAGE, visible.length - shown) })}
            </button>
          )}
          {moreUrl && moreLabel && (
            <a
              href={moreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-white/60"
            >
              {moreLabel}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------- Sur la fiche : Bluesky */

interface BuzzProps {
  film: FilmLookup;
  title: string;
}

/**
 * « Ça parle du film » : quelques posts Bluesky en carrousel, puis la feuille
 * complète. Rien ne s'affiche avec moins de deux posts retenus.
 */
export const BlueskyBuzz: React.FC<BuzzProps> = ({ film, title }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ReviewList | null>(null);
  const filmKey = `${film.titles.join('|')}:${film.year ?? ''}`;

  const load = useMemo<Loader>(() => (order) => fetchBlueskyReviews(film, order), [filmKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setList(null);
    load('relevance').then((result) => alive && setList(result));
    return () => {
      alive = false;
    };
  }, [load]);

  const items = list?.items ?? [];
  if (items.length < 2) return null;

  return (
    <div className="mb-8">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className={sectionLabel}>{t('reviews.buzz')}</h3>
        <span className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('reviews.onBluesky')}</span>
      </div>
      <p className="mb-3 text-[13px] font-bold text-stone-700 dark:text-stone-300">{t('reviews.postsKept', { n: compactCount(items.length, localeOf(language)) })}</p>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
        {items.slice(0, 6).map((review) => (
          <ReviewCard key={review.id} review={review} compact />
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          haptics.soft();
          setOpen(true);
        }}
        className="mt-1 flex min-h-[44px] items-center text-[10px] font-black uppercase tracking-[0.12em] text-forest dark:text-lime-400"
      >
        {t('reviews.seeAll', { n: items.length })} →
      </button>
      {open && (
        <PublicReviewsSheet
          title={title}
          kicker={t('reviews.buzz')}
          load={load}
          countLabel={(l) => t('reviews.postsKept', { n: compactCount(l?.items.length ?? items.length, localeOf(language)) })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
