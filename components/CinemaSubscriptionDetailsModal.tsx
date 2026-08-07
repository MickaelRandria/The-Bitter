import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { CinemaSubscription, Movie } from '../types';
import {
  SubscriptionPeriod,
  formatCurrency,
  getBreakEvenSessions,
  getSubscriptionStats,
} from '../utils/cinemaSubscription';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';
import CinemaSubscriptionArtwork from './CinemaSubscriptionArtwork';

interface CinemaSubscriptionDetailsModalProps {
  movies: Movie[];
  subscription: CinemaSubscription;
  onClose: () => void;
  onManage: () => void;
}

const PERIODS: { id: SubscriptionPeriod; labelKey: string }[] = [
  { id: 'currentMonth', labelKey: 'cinemaSub.period.currentMonth' },
  { id: 'previousMonth', labelKey: 'cinemaSub.period.previousMonth' },
  { id: 'year', labelKey: 'cinemaSub.period.year' },
  { id: 'allTime', labelKey: 'cinemaSub.period.allTime' },
];

/**
 * Détail des économies, en tiroir.
 *
 * Le coût affiché suit le nombre réel de mensualités de la période : sur l'année,
 * on ne soustrait jamais une seule mensualité.
 */
const CinemaSubscriptionDetailsModal: React.FC<CinemaSubscriptionDetailsModalProps> = ({
  movies,
  subscription,
  onClose,
  onManage,
}) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('cinemaSub.details.title'));
  const [period, setPeriod] = useState<SubscriptionPeriod>('currentMonth');

  const now = useMemo(() => new Date(), []);
  const stats = useMemo(
    () => getSubscriptionStats(movies, subscription, period, now),
    [movies, subscription, period, now]
  );
  const breakEven = getBreakEvenSessions(subscription);
  const brand = getCinemaProviderBrand(subscription.provider);

  const rows: { labelKey: string; value: string; accent?: boolean }[] = [
    { labelKey: 'cinemaSub.details.sessions', value: String(stats.sessions) },
    { labelKey: 'cinemaSub.details.value', value: formatCurrency(stats.value, language) },
    { labelKey: 'cinemaSub.details.cost', value: formatCurrency(stats.cost, language) },
    {
      labelKey: 'cinemaSub.details.net',
      value: `${stats.netSavings >= 0 ? '+' : ''}${formatCurrency(stats.netSavings, language)}`,
      accent: true,
    },
  ];

  // Barre de progression sur le mois : au-delà du seuil on la garde pleine.
  const progress =
    breakEven > 0 ? Math.min(100, Math.round((stats.sessions / breakEven) * 100)) : 0;

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className={`relative z-10 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t ${brand.modalClass}`}>
        <div className={`px-6 pt-5 pb-4 border-b flex items-center justify-between shrink-0 ${brand.headerClass}`}>
          <div className="min-w-0 flex items-center gap-3">
            <CinemaSubscriptionArtwork provider={subscription.provider} />
            <div className="min-w-0">
            <h2 className={`text-xl font-black tracking-tight truncate ${brand.headerTitleClass} ${brand.fontClass}`}>
              {subscription.name}
            </h2>
            <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${brand.headerMutedClass} ${brand.fontClass}`}>
              {formatCurrency(subscription.monthlyPrice, language)} {t('cinemaSub.perMonth')}
            </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`shrink-0 ml-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${brand.headerControlClass}`}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 ${brand.contentClass}`}>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {PERIODS.map(({ id, labelKey }) => (
              <button
                key={id}
                onClick={() => {
                  haptics.soft();
                  setPeriod(id);
                }}
                className={`shrink-0 px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                  period === id
                    ? brand.selectedClass
                    : brand.secondaryPillClass
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className={`border rounded-[2rem] p-5 divide-y divide-black/5 dark:divide-white/10 ${brand.cardClass}`}>
            {rows.map(({ labelKey, value, accent }) => (
              <div key={labelKey} className="flex items-baseline justify-between py-3 first:pt-0 last:pb-0">
                <span className={`text-[10px] font-black uppercase tracking-widest ${brand.labelClass}`}>
                  {t(labelKey)}
                </span>
                <span
                  className={`font-black tracking-tight ${
                    accent
                      ? `text-2xl ${stats.netSavings >= 0 ? 'text-forest dark:text-bitter-lime' : brand.titleClass}`
                      : `text-lg ${brand.titleClass}`
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {breakEven > 0 && (
            <div className={`border rounded-[2rem] p-5 ${brand.selectedCardClass}`}>
              <div className="flex items-baseline justify-between mb-3">
                <span className={`text-[10px] font-black uppercase tracking-widest ${brand.labelClass}`}>
                  {t('cinemaSub.details.breakEven')}
                </span>
                <span className={`text-sm font-black ${brand.titleClass}`}>
                  {stats.sessions} / {breakEven}
                </span>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${brand.progressTrackClass}`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${stats.isProfitable ? 'bg-forest dark:bg-bitter-lime' : brand.progressClass}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className={`text-[10px] font-medium mt-3 leading-relaxed ${brand.mutedTextClass}`}>
                {t('cinemaSub.details.monthsBilled', { count: String(stats.monthsBilled) })}
              </p>
            </div>
          )}
        </div>

        <div className={`p-6 pt-4 border-t shrink-0 ${brand.footerClass}`}>
          <button
            onClick={() => {
              haptics.soft();
              onManage();
            }}
            className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all ${brand.selectedClass}`}
          >
            {t('cinemaSub.details.manage')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CinemaSubscriptionDetailsModal;
