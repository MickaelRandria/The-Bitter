import React from 'react';
import { ScanEye } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface ConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Demande de consentement aux traceurs d'audience.
 *
 * Les deux réponses ont la même taille, la même place et la même typographie :
 * le RGPD veut que refuser coûte exactement le même geste qu'accepter. Rien n'est
 * chargé avant la réponse, et le texte le dit au futur — l'ancienne version
 * annonçait des traceurs « activés » alors que la question n'était pas posée.
 */
const ConsentModal: React.FC<ConsentModalProps> = ({ onAccept, onDecline }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onDecline, t('consent.title'));

  return (
    <div {...dialog.props} className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/90 backdrop-blur-md animate-[fadeIn_0.5s_ease-out]" />

      <div className="relative z-10 bg-white dark:bg-[#141414] w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100 dark:border-white/10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-stone-50 dark:bg-[#202020] rounded-2xl flex items-center justify-center text-charcoal dark:text-white mb-6 shadow-sm rotate-3">
            <ScanEye size={32} strokeWidth={1.5} />
          </div>

          <h2 className="text-2xl font-black text-charcoal dark:text-white tracking-tight mb-3">
            {t('consent.title')}
          </h2>

          <p className="text-stone-500 dark:text-stone-400 font-medium leading-relaxed text-sm mb-8">
            {t('consent.desc1')}
            <br />
            <br />
            {t('consent.desc2')}
          </p>

          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              onClick={onDecline}
              className="py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.15em] border border-stone-200 dark:border-white/15 text-charcoal dark:text-white hover:bg-stone-50 dark:hover:bg-white/5 active:scale-95 transition-all"
            >
              {t('consent.decline')}
            </button>
            <button
              onClick={onAccept}
              className="py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.15em] bg-charcoal dark:bg-white text-white dark:text-charcoal hover:bg-forest dark:hover:bg-stone-200 active:scale-95 transition-all"
            >
              {t('consent.accept')}
            </button>
          </div>

          <a
            href="/confidentialite"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest underline underline-offset-4 hover:text-charcoal dark:hover:text-white transition-colors"
          >
            {t('consent.policy')}
          </a>

          <p className="mt-3 text-[9px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-widest">
            {t('consent.revocable')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
