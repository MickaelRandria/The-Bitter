import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { btnPrimary, sheetFrame } from '../utils/ui';
import type { CommonFilmsPreview } from '../services/commonFilms';

/**
 * À l'arrivée dans un espace : « Vous avez 23 films en commun, les ajouter ? ».
 * Oui : les films entrent dans l'espace avec vos notes, sans notifier personne.
 * Pas maintenant : la question revient quand un nouveau membre arrive.
 */
const CommonFilmsSheet: React.FC<{
  preview: CommonFilmsPreview;
  spaceName: string;
  busy: boolean;
  onAnswer: (yes: boolean) => void;
}> = ({ preview, spaceName, busy, onAnswer }) => {
  const { t } = useLanguage();
  const close = () => {
    if (!busy) onAnswer(false);
  };
  const dialog = useDialog(close, t('commonFilms.label'));
  const { count, names, posters } = preview;
  const who =
    names.length <= 1
      ? names[0] ?? t('shared.member')
      : `${names.slice(0, -1).join(', ')} ${t('spaceSync.and')} ${names[names.length - 1]}`;

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[230] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md bg-cream px-6 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-7 text-charcoal dark:bg-[#161616] dark:text-white ${sheetFrame}`}
      >
        {posters.length > 0 && (
          <div className="flex" aria-hidden="true">
            {posters.map((poster, i) => (
              <img
                key={poster}
                src={resizeTmdbImage(poster, 'w185')}
                alt=""
                className={`h-[96px] w-[64px] rounded-xl object-cover border-[3px] border-cream dark:border-[#161616] shadow-sm ${i ? '-ml-4' : ''}`}
                style={{ zIndex: posters.length - i }}
              />
            ))}
          </div>
        )}
        <h2 className="mt-5 text-[26px] font-black leading-[1.02] tracking-[-0.045em]">
          {count === 1 ? t('commonFilms.titleOne') : t('commonFilms.title', { count: String(count) })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {t('commonFilms.body', { names: who, space: spaceName })}
        </p>
        <button type="button" disabled={busy} onClick={() => onAnswer(true)} className={`${btnPrimary} mt-6 w-full disabled:opacity-60`}>
          {busy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : count === 1 ? (
            t('commonFilms.addOne')
          ) : (
            t('commonFilms.add', { count: String(count) })
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer(false)}
          className="mt-2 h-12 w-full text-sm font-bold text-stone-500 dark:text-stone-400 active:scale-95 transition-transform disabled:opacity-40"
        >
          {t('commonFilms.later')}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default CommonFilmsSheet;
