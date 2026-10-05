import React, { useEffect, useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SpaceCopy, joinSpaceNames } from '../services/spaceSync';

interface Props {
  title: string;
  copies: SpaceCopy[];
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

/**
 * Après une note donnée depuis l'accueil, sur un film qui est aussi dans un de
 * mes espaces : « Ta note dans Ciné pote aussi ? ».
 *
 * Une barre, comme `SocialNudge`, et non une fenêtre. Elle reste un peu plus
 * longtemps qu'elle, parce qu'elle pose une vraie question ; laissée sans
 * réponse, elle vaut un non, et la note se publie encore depuis l'espace, où
 * elle est préremplie.
 */
const SpaceVerdictPrompt: React.FC<Props> = ({ title, copies, onConfirm, onDismiss }) => {
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (sending) return;
    const timer = setTimeout(onDismiss, 15000);
    return () => clearTimeout(timer);
  }, [onDismiss, sending]);

  const spaces = joinSpaceNames(
    copies.map((c) => c.spaceName),
    t('spaceSync.and')
  );
  const update = copies.every((c) => c.myRating);

  return (
    <div
      className="fixed left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-[250] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)' }}
      role="status"
    >
      <div className="flex items-center gap-3 bg-charcoal dark:bg-white text-white dark:text-charcoal rounded-[1.75rem] pl-4 pr-2 py-2 shadow-2xl">
        <Users size={18} className="shrink-0" />
        <p className="flex-1 min-w-0 text-[13px] font-bold leading-tight">
          {update ? t('spaceSync.askUpdate', { spaces }) : t('spaceSync.ask', { spaces })}
          <span className="block text-[11px] font-medium opacity-60 truncate">{title}</span>
        </p>
        <button
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              await onConfirm();
            } finally {
              setSending(false);
            }
          }}
          className="shrink-0 min-w-[3.5rem] px-4 py-2.5 rounded-full bg-lime-400 text-charcoal text-[11px] font-black uppercase tracking-wider active:scale-95 transition-transform flex items-center justify-center"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : t('spaceSync.yes')}
        </button>
        <button
          disabled={sending}
          onClick={onDismiss}
          className="shrink-0 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider opacity-70 hover:opacity-100"
        >
          {t('spaceSync.no')}
        </button>
      </div>
    </div>
  );
};

export default SpaceVerdictPrompt;
