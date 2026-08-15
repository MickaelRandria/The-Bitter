import React from 'react';
import { Ticket, ChevronRight } from 'lucide-react';
import { CinemaSubscription, Movie } from '../types';
import { formatCurrency, getSubscriptionStats } from '../utils/cinemaSubscription';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';
import CinemaSubscriptionArtwork from './CinemaSubscriptionArtwork';

interface CinemaSubscriptionCardProps {
  movies: Movie[];
  subscription?: CinemaSubscription;
  /** Ouvre le détail quand un abonnement existe. */
  onOpenDetails: () => void;
  /** Ouvre la configuration quand il n'y en a pas. */
  onConfigure: () => void;
}

/**
 * Encart compact de l'onglet Profil des statistiques.
 *
 * Trois états, un seul bloc : pas d'abonnement, abonnement pas encore rentabilisé,
 * abonnement rentabilisé. Quand il ne l'est pas, on n'affiche jamais le montant
 * négatif en gros : on met en avant le nombre de séances qui manquent, plus
 * actionnable et moins anxiogène.
 */
const CinemaSubscriptionCard: React.FC<CinemaSubscriptionCardProps> = ({
  movies,
  subscription,
  onOpenDetails,
  onConfigure,
}) => {
  const { t, language } = useLanguage();

  if (!subscription || !subscription.active) {
    return (
      <button
        onClick={() => {
          haptics.soft();
          onConfigure();
        }}
        className="w-full text-left bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all hover:border-stone-300 dark:hover:border-white/20 active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white">
            <Ticket size={18} />
          </div>
          <h3 className="text-sm font-black uppercase tracking-widest text-stone-400 flex-1 min-w-0">
            {t('cinemaSub.card.emptyTitle')}
          </h3>
        </div>
        <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed mb-4">
          {t('cinemaSub.card.emptySub')}
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-forest dark:text-bitter-lime">
          {t('cinemaSub.card.configure')}
          <ChevronRight size={13} strokeWidth={3} />
        </span>
      </button>
    );
  }

  const stats = getSubscriptionStats(movies, subscription, 'currentMonth', new Date());
  const brand = getCinemaProviderBrand(subscription.provider);

  return (
    <button
      onClick={() => {
        haptics.soft();
        onOpenDetails();
      }}
      /* `tileClass` et non `cardClass` : c'est la seule surface où la marque
         doit se voir de loin, puisque c'est par elle qu'on reconnaît son
         abonnement sans avoir à lire. */
      className={`w-full text-left border p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all active:scale-[0.99] ${brand.tileClass}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <CinemaSubscriptionArtwork provider={subscription.provider} />
        <h3 className={`text-sm font-black uppercase tracking-widest flex-1 min-w-0 truncate ${brand.actionTextClass}`}>
          {t('cinemaSub.card.title')}
        </h3>
        <ChevronRight size={14} strokeWidth={3} className={`shrink-0 ${brand.actionTextClass}`} />
      </div>

      {stats.isProfitable ? (
        <>
          <p className="text-4xl font-black text-forest dark:text-bitter-lime tracking-tighter">
            +{formatCurrency(stats.netSavings, language)}
          </p>
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${brand.labelClass}`}>
            {t('cinemaSub.card.savedThisMonth')}
          </p>
          <p className={`text-[10px] font-bold mt-3 ${brand.mutedTextClass}`}>
            {t('cinemaSub.card.sessionsProfitable', { count: String(stats.sessions) })}
          </p>
        </>
      ) : (
        <>
          {/* Le chiffre porte la couleur de la marque tant que l'abonnement
              n'est pas rentabilisé. Une fois qu'il l'est, c'est le vert de
              l'application qui prend le relais : l'économie appartient à
              l'utilisateur, pas à l'enseigne. */}
          <p className={`text-3xl font-black tracking-tighter ${brand.actionTextClass}`}>
            {t('cinemaSub.card.sessionsLeft', { count: String(stats.sessionsToBreakEven) })}
          </p>
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${brand.labelClass}`}>
            {t('cinemaSub.card.toBreakEven')}
          </p>
          <p className={`text-[10px] font-bold mt-3 ${brand.mutedTextClass}`}>
            {t('cinemaSub.card.valueOnCost', {
              value: formatCurrency(stats.value, language),
              cost: formatCurrency(stats.cost, language),
            })}
          </p>
        </>
      )}
    </button>
  );
};

export default CinemaSubscriptionCard;
