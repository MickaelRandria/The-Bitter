import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { fmt1 } from '../../utils/verdict';
import type { SpaceStory } from '../../services/affinities';
import type { Affinity } from '../../utils/affinities';

/**
 * Tes espaces actifs en stories, en haut de l'onglet Amis : un rond par espace,
 * cerclé de vert quand il s'y est passé quelque chose depuis ta dernière story.
 * Toucher un rond ouvre sa story (la dernière note d'un ami, ton accord avec le
 * groupe), qui mène à l'espace.
 */
const SEEN_KEY = 'bitter_space_stories_seen';

const readSeen = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};

interface Props {
  stories: SpaceStory[];
  /** Ton meilleur accord dans chaque espace. */
  twinBySpace: Map<string, Affinity>;
  onOpenSpace?: (spaceId: string) => void;
}

export default function SpaceStories({ stories, twinBySpace, onOpenSpace }: Props) {
  const { t } = useLanguage();
  const [seen, setSeen] = useState<Record<string, number>>(() => readSeen());
  const [index, setIndex] = useState<number | null>(null);
  const isNew = (s: SpaceStory) => (s.latest?.at ?? 0) > (seen[s.id] ?? 0);

  const markSeen = (s: SpaceStory) => {
    setSeen((prev) => {
      const next = { ...prev, [s.id]: Date.now() };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // Sans stockage, l'anneau revient à la prochaine visite.
      }
      return next;
    });
  };

  const current = index != null ? stories[index] : null;
  useEffect(() => {
    if (current) markSeen(current);
  }, [current?.id]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIndex(null);
      if (event.key === 'ArrowRight') setIndex((i) => (i != null && i < stories.length - 1 ? i + 1 : null));
      if (event.key === 'ArrowLeft') setIndex((i) => (i != null ? Math.max(0, i - 1) : null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, stories.length]);

  if (!stories.length) return null;

  const statusOf = (s: SpaceStory) =>
    isNew(s) && s.latest ? t('stories.rated', { name: s.latest.name }) : t('stories.upToDate');

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-[19px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{t('stories.title')}</h3>
        <small className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{t('stories.active', { n: String(stories.length) })}</small>
      </div>
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 no-scrollbar">
        {stories.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              haptics.soft();
              setIndex(i);
            }}
            aria-label={t('stories.open', { space: s.name })}
            className="flex w-[76px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className={`block h-[70px] w-[70px] rounded-full p-[3px] ${isNew(s) ? 'bg-[conic-gradient(#D9FF00,#3E5238,#D9FF00)]' : 'bg-sand dark:bg-white/15'}`}>
              <span className="block h-full w-full overflow-hidden rounded-full border-[3px] border-cream bg-sand dark:border-[#0c0c0c] dark:bg-white/10">
                {s.posterUrl && <img src={resizeTmdbImage(s.posterUrl, 'w154')} alt="" className="h-full w-full object-cover" />}
              </span>
            </span>
            <b className="w-full truncate text-center text-[11px] font-black text-charcoal dark:text-white">{s.name}</b>
            <small className={`-mt-1 w-full truncate text-center text-[9.5px] font-extrabold ${isNew(s) ? 'text-forest dark:text-bitter-lime' : 'text-stone-500 dark:text-stone-400'}`}>
              {statusOf(s)}
            </small>
          </button>
        ))}
      </div>

      {current &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={current.name} className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden overscroll-none bg-black [touch-action:none]">
            <div className="relative flex h-full max-h-[900px] w-full max-w-[480px] flex-col overflow-hidden bg-[#0c0c0c] px-6 pb-10 pt-[calc(env(safe-area-inset-top,0px)+50px)] text-white">
              {(current.latest?.posterUrl ?? current.posterUrl) && (
                <img src={resizeTmdbImage(current.latest?.posterUrl ?? current.posterUrl, 'w780')} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
              )}
              <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,12,0.55),rgba(12,12,12,0.95)_60%)]" />
              <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top,0px)+14px)] z-10 flex gap-1" aria-hidden="true">
                {stories.map((s, i) => (
                  <i key={s.id} className={`h-[3px] flex-1 rounded-full ${i <= (index ?? 0) ? 'bg-white' : 'bg-white/30'}`} />
                ))}
              </div>
              <div className="relative z-20 mt-1 flex items-center gap-2.5">
                <span className="h-9 w-9 overflow-hidden rounded-full border-2 border-bitter-lime bg-white/10">
                  {current.posterUrl && <img src={resizeTmdbImage(current.posterUrl, 'w92')} alt="" className="h-full w-full object-cover" />}
                </span>
                <b className="truncate text-[15px] font-black">{current.name}</b>
                <small className="shrink-0 text-[12px] font-bold text-white/60">· {t('stories.members', { n: String(current.members) })}</small>
                <button type="button" onClick={() => setIndex(null)} aria-label={t('common.close')} className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                  <X size={18} />
                </button>
              </div>
              {/* Toucher la gauche revient à l'espace précédent, la droite passe au suivant. */}
              <button type="button" aria-label={t('year.previous')} onClick={() => setIndex(Math.max(0, (index ?? 0) - 1))} className="absolute inset-y-0 left-0 z-[5] w-1/3" />
              <button
                type="button"
                aria-label={t('year.next')}
                onClick={() => setIndex((index ?? 0) < stories.length - 1 ? (index ?? 0) + 1 : null)}
                className="absolute inset-y-0 right-0 z-[5] w-2/3"
              />
              <div key={current.id} className="pointer-events-none relative z-10 mt-auto flex flex-col animate-[fadeIn_0.3s_ease-out] [&_button]:pointer-events-auto">
                {current.latest ? (
                  <>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bitter-lime">{t('stories.lastRating')}</p>
                    <p className="mt-2 text-[32px] font-black leading-[0.95] tracking-[-0.06em]">
                      {t('stories.ratedLine', { name: current.latest.name, title: current.latest.title, value: fmt1(current.latest.value) })}
                    </p>
                    <p className="mt-2.5 text-[14px] font-bold text-white/75">
                      {[
                        current.latest.mine != null ? t('stories.you', { v: fmt1(current.latest.mine) }) : t('stories.notYou'),
                        current.latest.missing > 0 ? t(current.latest.missing > 1 ? 'stories.missingMany' : 'stories.missingOne', { n: String(current.latest.missing) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </>
                ) : (
                  <p className="text-[28px] font-black leading-[0.95] tracking-[-0.05em]">{t('stories.quiet')}</p>
                )}
                {twinBySpace.get(current.id) && (
                  <div className="mt-4 rounded-2xl bg-white/[0.12] p-3">
                    <b className="block text-[22px] font-black">{twinBySpace.get(current.id)!.score} %</b>
                    <small className="text-[11px] font-bold text-white/70">{t('stories.twin', { name: twinBySpace.get(current.id)!.name })}</small>
                  </div>
                )}
                {onOpenSpace && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.medium();
                      const id = current.id;
                      setIndex(null);
                      onOpenSpace(id);
                    }}
                    className="mt-5 h-[52px] rounded-full bg-bitter-lime text-[15px] font-black text-charcoal active:scale-[0.98]"
                  >
                    {t('stories.go')}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
