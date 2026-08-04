import React from 'react';
import { Compass, Clock, X } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

export type TourPromptVariant = 'main' | 'rating';

interface TourPromptProps {
  variant: TourPromptVariant;
  /** Nombre d'étapes du parcours proposé, affiché avec la durée. */
  stepCount: number;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Demande avant de lancer une visite guidée.
 *
 * Les deux parcours démarrent automatiquement (création de profil, première
 * ouverture de l'écran d'ajout) : les imposer serait intrusif. On annonce donc ce
 * qu'ils couvrent et combien de temps ça prend, et on rappelle qu'ils restent
 * accessibles depuis le profil si on refuse.
 */
const TourPrompt: React.FC<TourPromptProps> = ({ variant, stepCount, onAccept, onDecline }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onDecline, t(`tourPrompt.${variant}.title`));

  const handleAccept = () => {
    haptics.medium();
    onAccept();
  };

  const handleDecline = () => {
    haptics.soft();
    onDecline();
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 bg-[#0c0c0c]/90 backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full max-w-sm bg-[#0c0c0c] border border-white/10 rounded-[2rem] p-7 shadow-2xl overflow-hidden animate-[scaleIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="absolute top-[-30%] left-[-20%] w-[220px] h-[220px] bg-[#D9FF00]/10 rounded-full blur-[100px] pointer-events-none" />

        <button
          onClick={handleDecline}
          aria-label={t('common.close')}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
        >
          <X size={14} strokeWidth={2.5} />
        </button>

        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-[#D9FF00]/10 border border-[#D9FF00]/30 flex items-center justify-center text-[#D9FF00] mb-4">
            <Compass size={22} strokeWidth={2} />
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight leading-tight mb-2 pr-8">
            {t(`tourPrompt.${variant}.title`)}
          </h2>
          <p className="text-[13px] font-medium text-stone-400 leading-relaxed">
            {t(`tourPrompt.${variant}.body`)}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-stone-300">
            <Clock size={12} className="text-[#D9FF00]" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              {t(`tourPrompt.${variant}.duration`, { count: String(stepCount) })}
            </span>
          </div>

          <div className="mt-6 space-y-2">
            <button
              onClick={handleAccept}
              data-testid="tour-prompt-accept"
              className="w-full bg-[#D9FF00] text-black py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all hover:brightness-95"
            >
              {t('tourPrompt.accept')}
            </button>
            <button
              onClick={handleDecline}
              className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-stone-300 font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-white/10"
            >
              {t('tourPrompt.decline')}
            </button>
          </div>

          <p className="mt-4 text-[10px] font-medium text-stone-500 text-center leading-relaxed">
            {t('tourPrompt.later')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TourPrompt;
