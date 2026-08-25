import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface DemoBannerProps {
  /** Efface la démo et renvoie à l'écran d'accueil pour créer un vrai profil. */
  onExit: () => void;
}

/**
 * Le bandeau de la démonstration.
 *
 * Il est `fixed` et non dans le flux : quelqu'un à qui on montre l'application
 * doit pouvoir lire à tout moment que ce profil n'est pas le sien, y compris
 * après avoir fait défiler la page, et y compris sur l'écran d'un espace partagé
 * qui n'a pas d'en-tête. Son z-index le place au-dessus de l'en-tête (z-40) et de
 * la barre du bas (z-50), mais sous les modales et les toasts (z-200) : une
 * confirmation ne doit jamais passer derrière lui.
 *
 * Sa hauteur est fixe et connue d'App.tsx, qui décale d'autant le haut de l'en-tête.
 * En la changeant ici, changer aussi `DEMO_BANNER_OFFSET` là-bas.
 */
const DemoBanner: React.FC<DemoBannerProps> = ({ onExit }) => {
  const { t } = useLanguage();

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] bg-charcoal/95 dark:bg-black/95 backdrop-blur-xl border-b border-bitter-lime/30"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      role="status"
    >
      <div className="mx-auto flex h-11 max-w-2xl items-center gap-3 px-5">
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-bitter-lime px-2 py-1 text-[9px] font-black uppercase tracking-widest text-charcoal">
          <Sparkles size={10} strokeWidth={3} />
          {t('demo.badge')}
        </span>

        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/70">
          {t('demo.banner')}
        </p>

        <button
          type="button"
          onClick={() => {
            haptics.medium();
            onExit();
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:border-bitter-lime hover:text-bitter-lime active:scale-95"
        >
          {t('demo.exit')}
          <ArrowRight size={11} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
