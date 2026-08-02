import React from 'react';
import {
  X,
  Instagram,
  EyeOff,
  Sparkles,
  CalendarRange,
  MousePointerClick,
  MessageSquareText,
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface NewFeaturesModalProps {
  onClose: () => void;
  /** Opt-out durable : la modale ne se rouvrira plus, même après une mise à jour. */
  onNeverShowAgain?: () => void;
}

const NewFeaturesModal: React.FC<NewFeaturesModalProps> = ({ onClose, onNeverShowAgain }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('newFeatures.newBadge'));

  const handleComplete = () => {
    haptics.success();
    onClose();
  };

  const handleNeverShowAgain = () => {
    haptics.medium();
    if (onNeverShowAgain) onNeverShowAgain();
  };

  // Un seul écran : tout est listé, on ne force plus 5 étapes avant d'accéder à l'app.
  // Les nouveautés de la version en cours d'abord, les précédentes ensuite.
  const features = [
    {
      key: 'recap',
      icon: CalendarRange,
      accent: 'text-bitter-lime',
      badge: t('newFeatures.newBadge'),
    },
    {
      key: 'editorial',
      icon: Instagram,
      accent: 'text-pink-400',
      badge: t('newFeatures.editorial.badge'),
    },
    {
      key: 'polish',
      icon: MousePointerClick,
      accent: 'text-white',
      badge: t('newFeatures.newBadge'),
    },
    {
      key: 'step4',
      icon: MessageSquareText,
      accent: 'text-white',
      badge: t('newFeatures.step4.badge'),
    },
    {
      key: 'step0',
      icon: Sparkles,
      accent: 'text-white',
      badge: t('newFeatures.step0.badge'),
    },
  ];

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-[#0c0c0c] sm:bg-[#0c0c0c]/90 sm:backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]"
      onClick={onClose}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-md bg-[#0c0c0c] sm:rounded-[3rem] flex flex-col relative overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-20%] w-[300px] h-[300px] bg-[#a3e635]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Fermer — toujours accessible, dès l'ouverture */}
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        <div className="flex-1 flex flex-col min-h-0 p-8 sm:p-10 pt-16 sm:pt-12">
          <div className="shrink-0 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#a3e635]/30 bg-[#a3e635]/10 text-[#a3e635] text-[9px] font-black uppercase tracking-widest mb-4">
              <Sparkles size={12} />
              {t('newFeatures.newBadge')}
            </div>
            <h2 className="text-4xl font-black text-white tracking-tighter leading-[0.95]">
              {t('newFeatures.recapTitle1')}{' '}
              <span className="text-bitter-lime">{t('newFeatures.recapTitle2')}</span>
            </h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3">
            {features.map(({ key, icon: Icon, accent, badge }) => (
              <div
                key={key}
                className="bg-[#1a1a1a] border border-white/10 p-5 rounded-[1.75rem] flex gap-4"
              >
                <div
                  className={`w-11 h-11 shrink-0 bg-[#0c0c0c] border border-white/10 rounded-2xl flex items-center justify-center ${accent}`}
                >
                  <Icon size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">
                      {t(`newFeatures.${key}.title1`)} {t(`newFeatures.${key}.title2`)}
                    </h3>
                    <span className="text-[8px] font-black uppercase tracking-widest text-stone-500">
                      {badge}
                    </span>
                  </div>
                  <p
                    className="text-stone-400 text-xs font-medium leading-relaxed [&_b]:text-stone-200"
                    dangerouslySetInnerHTML={{ __html: t(`newFeatures.${key}.desc`) }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 shrink-0 flex flex-col items-center gap-4 pb-4 sm:pb-0">
            <button
              onClick={handleComplete}
              className="w-full bg-[#a3e635] text-black py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-[#8ec72e] shadow-xl shadow-[#a3e635]/20"
            >
              {t('newFeatures.close')}
            </button>

            {onNeverShowAgain && (
              <button
                onClick={handleNeverShowAgain}
                className="flex items-center gap-2 text-[10px] font-bold text-stone-400 hover:text-white uppercase tracking-widest transition-colors"
              >
                <EyeOff size={12} />
                {t('newFeatures.neverShow')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewFeaturesModal;
