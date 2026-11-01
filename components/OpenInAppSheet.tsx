import React from 'react';
import { createPortal } from 'react-dom';
import { Smartphone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { btnPrimary, sheetFrame } from '../utils/ui';

/**
 * Lien d'espace partagé (récap du mois, blind test) ouvert dans Safari sur
 * iPhone. iOS n'ouvre jamais l'app installée depuis un lien : on le dit, et on
 * invite à toucher l'icône. Sans l'app, on continue ici, l'espace s'ouvre une
 * fois connecté.
 */
const OpenInAppSheet: React.FC<{ story: string; onClose: () => void }> = ({ story, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('openInApp.label'));
  const body = story === 'recap' ? 'openInApp.bodyRecap' : story === 'blind' ? 'openInApp.bodyBlind' : 'openInApp.body';

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[230] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md bg-cream px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-6 text-charcoal dark:bg-[#161616] dark:text-white ${sheetFrame}`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-bitter-lime text-[#111]">
          <Smartphone size={26} />
        </div>
        <h2 className="mt-4 text-[26px] font-black leading-[1.02] tracking-[-0.045em]">{t('openInApp.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{t(body)}</p>
        <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{t('openInApp.noApp')}</p>
        <button type="button" onClick={onClose} className={`${btnPrimary} mt-5 w-full`}>
          {t('openInApp.stay')}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default OpenInAppSheet;
