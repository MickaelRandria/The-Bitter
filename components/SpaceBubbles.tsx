import React from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SharedSpace } from '../services/supabase';
import { haptics } from '../utils/haptics';

interface Props {
  spaces: SharedSpace[];
  /** Demandes en attente, par espace (voir `loadTodoCounts`). */
  counts: Map<string, number>;
  onOpen: (space: SharedSpace) => void;
  onCreate: () => void;
}

/** Teintes sombres, lisibles sous un monogramme blanc, attribuées par espace. */
const TINTS = ['#3E5238', '#B45309', '#44403C', '#3D405B', '#7F5539', '#2F3E46'];

export const tintOf = (space: SharedSpace): string => {
  if (space.color && /^#[0-9a-f]{6}$/i.test(space.color)) return space.color;
  let hash = 0;
  for (const ch of space.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
};

/** « Ciné pote » → « CP », « Famille » → « FA ». */
export const monogramOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
};

/**
 * Les espaces en bulles, en haut de l'accueil.
 *
 * On n'entrait dans un espace que par Profil → Espaces → la liste, ou par une
 * notification : trois appuis, cachés derrière l'avatar. Une bulle par espace,
 * cerclée et chiffrée quand quelque chose y attend une réponse ; l'espace où
 * l'on est attendu passe devant.
 */
const SpaceBubbles: React.FC<Props> = ({ spaces, counts, onOpen, onCreate }) => {
  const { t } = useLanguage();
  const sorted = [...spaces].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  return (
    <section aria-label={t('spaces.bubblesTitle')} className="-mx-6">
      <p className="px-6 mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500">
        {t('spaces.bubblesTitle')}
      </p>
      <div className="flex gap-4 overflow-x-auto no-scrollbar px-6 pb-1">
        {sorted.map((space) => {
          const count = counts.get(space.id) ?? 0;
          return (
            <button
              key={space.id}
              onClick={() => {
                haptics.soft();
                onOpen(space);
              }}
              aria-label={
                count
                  ? t('spaces.bubbleWaiting', { name: space.name, count: String(count) })
                  : t('spaces.bubbleOpen', { name: space.name })
              }
              className="w-[72px] shrink-0 flex flex-col items-center gap-[7px] active:scale-95 transition-transform"
            >
              <span
                className={`relative block w-[72px] h-[72px] rounded-full p-[3px] ${count ? 'bg-bitter-lime' : 'bg-stone-200 dark:bg-white/10'}`}
              >
                <span
                  className="w-full h-full rounded-full border-[3px] border-cream dark:border-[#0c0c0c] flex items-center justify-center text-white text-[19px] font-black tracking-tight"
                  style={{ background: tintOf(space) }}
                >
                  {monogramOf(space.name)}
                </span>
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal border-2 border-cream dark:border-[#0c0c0c] text-[11px] font-black flex items-center justify-center">
                    {count}
                  </span>
                )}
              </span>
              <span
                className={`max-w-full truncate text-[11px] ${count ? 'font-extrabold text-charcoal dark:text-white' : 'font-bold text-stone-500 dark:text-stone-400'}`}
              >
                {space.name}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => {
            haptics.soft();
            onCreate();
          }}
          aria-label={t('spaces.create')}
          className="w-[72px] shrink-0 flex flex-col items-center gap-[7px] active:scale-95 transition-transform"
        >
          <span className="w-[72px] h-[72px] rounded-full border-2 border-dashed border-stone-400 dark:border-stone-600 flex items-center justify-center">
            <Plus size={22} strokeWidth={2.6} className="text-stone-500" />
          </span>
          <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">{t('spaces.bubbleNew')}</span>
        </button>
      </div>
    </section>
  );
};

export default SpaceBubbles;
