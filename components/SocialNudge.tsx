import React, { useEffect } from 'react';
import { Users, MessageCircle, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { ShareKind } from '../services/social';

interface Props {
  kind: ShareKind;
  title: string;
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * La question posée juste après le geste : « Le voir avec quelqu'un ? » après un
 * ajout à la liste, « Demander son avis ? » après une note.
 *
 * Une barre et non une fenêtre : elle ne bloque rien et s'efface seule. Ouvrir une
 * feuille à chaque ajout ferait payer la fonctionnalité à tous ceux qui n'en
 * veulent pas ce jour-là.
 */
const SocialNudge: React.FC<Props> = ({ kind, title, onOpen, onDismiss }) => {
  const { t } = useLanguage();

  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-[250] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)' }}
      role="status"
    >
      <div className="flex items-center gap-3 bg-charcoal dark:bg-white text-white dark:text-charcoal rounded-[1.75rem] pl-4 pr-2 py-2 shadow-2xl">
        {kind === 'verdict' ? <MessageCircle size={18} className="shrink-0" /> : <Users size={18} className="shrink-0" />}
        <p className="flex-1 min-w-0 text-[13px] font-bold leading-tight">
          {kind === 'verdict' ? t('social.nudgeVerdict') : t('social.nudgeWatch')}
          <span className="block text-[11px] font-medium opacity-60 truncate">{title}</span>
        </p>
        <button
          onClick={onOpen}
          className="shrink-0 px-4 py-2.5 rounded-full bg-lime-400 text-charcoal text-[11px] font-black uppercase tracking-wider active:scale-95 transition-transform"
        >
          {kind === 'verdict' ? t('social.nudgeVerdictCta') : t('social.nudgeWatchCta')}
        </button>
        <button onClick={onDismiss} aria-label={t('common.close')} className="shrink-0 p-2 opacity-60 hover:opacity-100">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default SocialNudge;
