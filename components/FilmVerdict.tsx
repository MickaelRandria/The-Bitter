import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, ExternalLink, Loader2, Minus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { btnClose, sectionLabel } from '../utils/ui';
import { FocusKey } from '../utils/criterionFocus';
import {
  VerdictCriterion,
  VerdictFacts,
  VerdictFilm,
  VerdictResult,
  VerdictTone,
  cachedVerdict,
  fetchVerdict,
  fetchVerdictFacts,
  hasEnoughFacts,
} from '../services/filmVerdict';

/**
 * « Ce qu'en dit Internet », d'après la maquette validée le 7 novembre 2026 :
 * une carte sur la fiche (repliée si le film est déjà vu, pour ne pas peser sur
 * la note), le résumé complet en feuille, et un raccourci dans le fil.
 *
 * Les chiffres affichés viennent tels quels de SensCritique et d'OMDb, avec
 * leur volume ; seules les phrases sont écrites par Mistral.
 */

const CRITERIA: VerdictCriterion[] = ['image', 'sound', 'interpretation', 'scenario'];

const toneClass: Record<VerdictTone, string> = {
  unanime: 'bg-charcoal text-white dark:bg-white dark:text-charcoal',
  apprecie: 'bg-forest text-white',
  divise: 'border border-stone-400 text-stone-700 dark:border-white/30 dark:text-stone-200',
  critique: 'bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-300',
};

const fmtNumber = (n: number, language: string, digits = 1) =>
  new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const fmtCompact = (n: number, language: string) =>
  new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Les cases de chiffres : jamais un chiffre sans son volume. */
function scoreTiles(facts: VerdictFacts | null, t: (k: string, p?: Record<string, string | number>) => string, language: string) {
  if (!facts) return [];
  const tiles: { value: string; label: string; sub: string }[] = [];
  const sc = facts.sensCritique;
  if (sc?.rating != null && sc.ratings >= 50)
    tiles.push({ value: fmtNumber(sc.rating, language), label: 'SensCritique', sub: t('verdict.ratings', { n: fmtCompact(sc.ratings, language) }) });
  if (facts.imdb?.rating != null)
    tiles.push({
      value: fmtNumber(facts.imdb.rating, language),
      label: 'IMDb',
      sub: facts.imdb.votes ? t('verdict.votes', { n: fmtCompact(facts.imdb.votes, language) }) : t('verdict.public'),
    });
  if (facts.press?.rottenTomatoes != null)
    tiles.push({ value: `${Math.round(facts.press.rottenTomatoes)} %`, label: t('verdict.press'), sub: 'Rotten Tomatoes' });
  else if (facts.press?.metacritic != null)
    tiles.push({ value: String(Math.round(facts.press.metacritic)), label: t('verdict.press'), sub: 'Metacritic /100' });
  if (sc?.positiveShare != null)
    tiles.push({ value: `${Math.round(sc.positiveShare * 100)} %`, label: t('verdict.positive'), sub: t('verdict.onReviews', { n: sc.sampled }) });
  return tiles;
}

const Tiles: React.FC<{ facts: VerdictFacts | null; max?: number; size?: 'card' | 'sheet' }> = ({ facts, max = 3, size = 'card' }) => {
  const { t, language } = useLanguage();
  const tiles = scoreTiles(facts, t, language).slice(0, max);
  if (!tiles.length) return null;
  return (
    <div className={`grid gap-2 ${tiles.length >= 3 ? 'grid-cols-3' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${size === 'sheet' && tiles.length === 4 ? '!grid-cols-2' : ''}`}>
      {tiles.map((tile) => (
        <div key={tile.label + tile.sub} className="min-w-0 rounded-2xl bg-sand px-2.5 py-2.5 dark:bg-white/[0.06]">
          <p className={`${size === 'sheet' ? 'text-[24px]' : 'text-[20px]'} font-black leading-none tracking-[-0.04em] text-charcoal dark:text-white`}>{tile.value}</p>
          <p className="mt-1.5 truncate text-[10px] font-extrabold text-stone-700 dark:text-stone-200">{tile.label}</p>
          <p className="truncate text-[9px] font-bold text-stone-500 dark:text-stone-400">{tile.sub}</p>
        </div>
      ))}
    </div>
  );
};

const ToneChip: React.FC<{ tone: VerdictTone }> = ({ tone }) => {
  const { t } = useLanguage();
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${toneClass[tone]}`}>{t(`verdict.tone.${tone}`)}</span>;
};

/** Facts tout de suite, résumé en parallèle. */
function useVerdict(film: VerdictFilm | null, enabled: boolean) {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'fr';
  const [facts, setFacts] = useState<VerdictFacts | null | undefined>(undefined);
  const [result, setResult] = useState<VerdictResult | null>(() => (film ? cachedVerdict(film.tmdbId, lang) : null));
  const filmKey = film ? `${film.tmdbId}:${film.imdbId ?? ''}:${film.titles.join('|')}` : '';

  useEffect(() => {
    if (!film || !enabled) return;
    let alive = true;
    const cached = cachedVerdict(film.tmdbId, lang);
    setResult(cached);
    if (cached) {
      setFacts(cached.facts);
      return;
    }
    setFacts(undefined);
    fetchVerdictFacts(film).then((f) => alive && setFacts((prev) => prev ?? f));
    fetchVerdict(film, lang).then((r) => {
      if (!alive) return;
      setResult(r);
      if (r.facts) setFacts(r.facts);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmKey, enabled, lang]);

  return { facts, result, summaryLoading: enabled && !result };
}

/* ------------------------------------------------------------- La carte */

interface CardProps {
  film: VerdictFilm;
  title: string;
  /** Film déjà vu : la carte reste repliée, on l'ouvre si on veut. */
  seen?: boolean;
  focus?: FocusKey | null;
}

export const VerdictCard: React.FC<CardProps> = ({ film, title, seen = false, focus }) => {
  const { t } = useLanguage();
  const [unfolded, setUnfolded] = useState(!seen);
  const [open, setOpen] = useState(false);
  const { facts, result, summaryLoading } = useVerdict(film, unfolded);
  const summary = result?.summary ?? null;

  if (!unfolded) {
    return (
      <button
        type="button"
        onClick={() => {
          haptics.soft();
          setUnfolded(true);
        }}
        className="mb-8 flex min-h-[48px] w-full items-center justify-between rounded-2xl border border-stone-200 px-4 text-left dark:border-white/10"
      >
        <span className={sectionLabel}>{t('verdict.title')}</span>
        <ChevronRight size={16} className="text-stone-500" />
      </button>
    );
  }

  // Rien à dire : ni chiffre, ni résumé.
  if (facts !== undefined && !hasEnoughFacts(facts) && !summary && !summaryLoading) return null;

  const readable = facts?.readable ?? 0;

  return (
    <div className="mb-8">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className={sectionLabel}>{t('verdict.title')}</h3>
        {summary && readable > 0 && <span className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('verdict.readCount', { n: readable })}</span>}
      </div>
      <div className="flex flex-col gap-4 rounded-3xl border border-stone-100 bg-white p-[18px] shadow-soft dark:border-white/10 dark:bg-[#161616]">
        {summary ? (
          <p className="text-[19px] font-black leading-[1.2] tracking-[-0.03em] text-charcoal dark:text-white">{summary.verdict}</p>
        ) : summaryLoading ? (
          <p role="status" className="flex items-center gap-2 text-[14px] font-extrabold text-charcoal dark:text-white">
            <Loader2 size={15} className="animate-spin text-forest dark:text-lime-400" />
            {readable ? t('verdict.reading', { n: readable }) : t('verdict.readingSome')}
          </p>
        ) : result?.few ? (
          <p className="text-[17px] font-black leading-[1.25] tracking-[-0.03em] text-charcoal dark:text-white">{t('verdict.few', { n: readable })}</p>
        ) : null}

        {facts === undefined ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-[62px] animate-pulse rounded-2xl bg-sand dark:bg-white/[0.06]" />
            ))}
          </div>
        ) : (
          <Tiles facts={facts} />
        )}

        {summary && Object.keys(summary.criteria).length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {CRITERIA.filter((key) => summary.criteria[key]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-1.5">
                <span className="text-[12px] font-bold text-stone-700 dark:text-stone-300">{t(`verdict.crit.${key}`)}</span>
                <ToneChip tone={summary.criteria[key]!.tone} />
              </div>
            ))}
          </div>
        )}

        {summary && (
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setOpen(true);
            }}
            className="-mx-1 -mb-2 -mt-1.5 flex min-h-[44px] items-center justify-between px-1 text-[11px] font-black uppercase tracking-[0.12em] text-forest dark:text-lime-400"
          >
            {t('verdict.read')}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {open && <VerdictSheet film={film} title={title} focus={focus} initial={result} onClose={() => setOpen(false)} />}
    </div>
  );
};

/* -------------------------------------------------------- Le résumé entier */

interface SheetProps {
  film: VerdictFilm;
  title: string;
  focus?: FocusKey | null;
  initial?: VerdictResult | null;
  /** Au-dessus du fil, toujours sombre. */
  dark?: boolean;
  onClose: () => void;
}

const Points: React.FC<{ label: string; items: string[]; kind: 'loved' | 'divides' | 'disappoints' }> = ({ label, items, kind }) => {
  if (!items.length) return null;
  const mark =
    kind === 'loved' ? (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-charcoal text-bitter-lime dark:bg-white dark:text-charcoal"><Check size={12} strokeWidth={3} /></span>
    ) : kind === 'divides' ? (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-stone-400 text-stone-600 dark:border-white/30 dark:text-stone-300"><Minus size={12} strokeWidth={3} /></span>
    ) : (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300"><X size={12} strokeWidth={3} /></span>
    );
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={sectionLabel}>{label}</h3>
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2.5">
          {mark}
          <p className="text-[14px] font-semibold leading-[1.45] text-stone-800 dark:text-stone-100">{item}</p>
        </div>
      ))}
    </section>
  );
};

const ago = (at: number | undefined, language: string) => {
  if (!at) return '';
  const hours = Math.max(0, Math.round((Date.now() - at) / 3600_000));
  const rtf = new Intl.RelativeTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', { numeric: 'auto' });
  return hours < 24 ? rtf.format(-hours, 'hour') : rtf.format(-Math.round(hours / 24), 'day');
};

export const VerdictSheet: React.FC<SheetProps> = ({ film, title, focus, initial, dark = false, onClose }) => {
  const { t, language } = useLanguage();
  const fetched = useVerdict(initial?.summary ? null : film, true);
  const result = initial?.summary ? initial : fetched.result;
  const facts = initial?.summary ? initial.facts : fetched.facts ?? null;
  const summary = result?.summary ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const focusLine = focus && summary?.criteria[focus] ? t(`verdict.forYou.${summary.criteria[focus]!.tone}`, { crit: t(`verdict.critArticle.${focus}`) }) : null;
  const sources = [facts?.sensCritique ? 'SensCritique' : null, facts?.bluesky ? 'Bluesky' : null].filter(Boolean).join(', ');
  const notes = [facts?.imdb ? 'IMDb' : null, facts?.press?.rottenTomatoes != null ? 'Rotten Tomatoes' : null, facts?.press?.metacritic != null ? 'Metacritic' : null].filter(Boolean).join(', ');

  return createPortal(
    <div className={`${dark ? 'dark' : ''} fixed inset-0 z-[120] flex items-end justify-center sm:items-center`} role="dialog" aria-modal="true" aria-label={t('verdict.title')}>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[90dvh] w-full flex-col rounded-t-[2.5rem] bg-cream text-charcoal shadow-2xl animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] dark:bg-[#111] dark:text-white sm:max-w-md sm:rounded-[2.5rem]">
        <span className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-stone-300 dark:bg-white/20" />
        <div className="flex shrink-0 justify-end px-4 pt-1">
          <button type="button" onClick={onClose} aria-label={t('common.close')} className={btnClose}>
            <X size={18} strokeWidth={2.6} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] no-scrollbar">
          <div className="flex flex-col gap-[26px]">
            <header className="flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-forest dark:text-bitter-lime">{t('verdict.title')}</p>
              <p className="text-[13px] font-extrabold text-stone-600 dark:text-stone-300">{title}</p>
              {summary ? (
                <>
                  <h2 className="text-[30px] font-black leading-[1.02] tracking-[-0.05em]">{summary.verdict}</h2>
                  {summary.overview && <p className="mt-1 text-[14px] font-medium leading-[1.55] text-stone-600 dark:text-stone-300">{summary.overview}</p>}
                </>
              ) : result?.few ? (
                <h2 className="text-[24px] font-black leading-[1.1] tracking-[-0.04em]">{t('verdict.few', { n: facts?.readable ?? 0 })}</h2>
              ) : (
                <p role="status" className="flex items-center gap-2 py-6 text-[14px] font-extrabold">
                  <Loader2 size={16} className="animate-spin text-forest dark:text-lime-400" />
                  {t('verdict.readingSome')}
                </p>
              )}
            </header>

            <Tiles facts={facts} max={4} size="sheet" />

            {focusLine && (
              <section className="flex flex-col gap-2 rounded-3xl bg-charcoal p-[18px] text-white dark:bg-white/[0.08]">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                  <i className="h-1.5 w-1.5 rounded-full bg-bitter-lime" />
                  {t('verdict.forYouTitle')}
                </p>
                <p className="text-[15px] font-bold leading-[1.45]">{focusLine}</p>
              </section>
            )}

            {summary && (
              <>
                <Points label={t('verdict.loved')} items={summary.loved} kind="loved" />
                <Points label={t('verdict.divides')} items={summary.divides} kind="divides" />
                <Points label={t('verdict.disappoints')} items={summary.disappoints} kind="disappoints" />

                {Object.keys(summary.criteria).length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <h3 className={sectionLabel}>{t('verdict.byCriterion')}</h3>
                    <div className="overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-soft dark:border-white/10 dark:bg-[#161616]">
                      {CRITERIA.filter((key) => summary.criteria[key]).map((key, i, list) => (
                        <div key={key} className={`flex flex-col gap-1 px-4 py-3.5 ${i < list.length - 1 ? 'border-b border-stone-100 dark:border-white/10' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] font-black">{t(`verdict.crit.${key}`)}</span>
                            <ToneChip tone={summary.criteria[key]!.tone} />
                          </div>
                          <p className="text-[12px] font-medium leading-[1.5] text-stone-600 dark:text-stone-300">{summary.criteria[key]!.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {summary.quotes.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <h3 className={sectionLabel}>{t('verdict.quotes')}</h3>
                    {summary.quotes.map((q) => (
                      <figure key={q.text} className="flex flex-col gap-2 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.06]">
                        <blockquote className="text-[14px] font-semibold leading-[1.45] text-stone-800 dark:text-stone-100">« {q.text} »</blockquote>
                        <figcaption className="flex items-center justify-between gap-2 text-[10px] font-extrabold text-stone-500 dark:text-stone-400">
                          <span className="truncate">{q.origin === 'bluesky' ? q.author : t('verdict.scReview')}</span>
                          <a href={q.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[28px] shrink-0 items-center gap-1 uppercase tracking-[0.1em]">
                            {q.origin === 'bluesky' ? 'Bluesky' : 'SensCritique'}
                            <ExternalLink size={10} />
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </section>
                )}
              </>
            )}

            {(summary || result?.few) && (
              <section className="flex flex-col gap-1 border-t border-sand pt-3 dark:border-white/10">
                <p className="text-[11px] font-bold leading-[1.5] text-stone-500 dark:text-stone-400">
                  {summary ? t('verdict.footer', { n: facts?.readable ?? 0, sources: sources || '—', notes: notes || '—', when: ago(result?.at, language) }) : t('verdict.fewHint')}
                </p>
                {facts?.sensCritique?.url && (
                  <a href={facts.sensCritique.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-forest dark:text-lime-400">
                    {t('verdict.readOnSc', { n: facts.sensCritique.reviews })}
                    <ExternalLink size={12} />
                  </a>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ------------------------------------------------------- Dans le fil */

/**
 * Sous une bande-annonce du fil : le verdict s'il a déjà été lu sur cet
 * appareil, sinon l'invitation. Rien n'est demandé au serveur avant le tap.
 */
export const VerdictChip: React.FC<{ film: VerdictFilm; title: string; focus?: FocusKey | null; onOpen?: () => void }> = ({ film, title, focus, onOpen }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const cached = cachedVerdict(film.tmdbId, language === 'en' ? 'en' : 'fr');
  const tiles = scoreTiles(cached?.facts ?? null, t, language).slice(0, 3);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.soft();
          onOpen?.();
          setOpen(true);
        }}
        className="mb-3 flex w-full flex-col gap-1.5 rounded-2xl border border-bitter-lime/35 bg-white/[0.06] px-3 py-2.5 text-left backdrop-blur-md"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/75">
            <i className="h-1.5 w-1.5 rounded-full bg-bitter-lime" />
            {t('verdict.title')}
          </span>
          {tiles.length > 0 && <span className="truncate text-[10px] font-extrabold text-white/70">{tiles.map((tile) => tile.value).join(' · ')}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-extrabold leading-[1.3] text-white">{cached?.summary?.verdict ?? t('verdict.open')}</span>
          <ChevronRight size={14} className="shrink-0 text-white" />
        </span>
      </button>
      {open && <VerdictSheet dark film={film} title={title} focus={focus} initial={cached} onClose={() => setOpen(false)} />}
    </>
  );
};
