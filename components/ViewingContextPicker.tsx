import React from 'react';
import { Clapperboard, Home, MoreHorizontal } from 'lucide-react';
import {
  CinemaSubscription,
  CinemaViewingPaymentType,
  ViewingContext,
  ViewingLocationType,
} from '../types';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import CinemaProviderBadge from './CinemaProviderBadge';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';

interface ViewingContextPickerProps {
  value?: ViewingContext;
  onChange: (context: ViewingContext | undefined) => void;
  /** Abonnement actif, s'il y en a un : conditionne l'option « inclus ». */
  subscription?: CinemaSubscription;
  showLabel?: boolean;
}

const LOCATIONS: { id: ViewingLocationType; labelKey: string; Icon: React.ElementType }[] = [
  { id: 'cinema', labelKey: 'viewing.cinema', Icon: Clapperboard },
  { id: 'home', labelKey: 'viewing.home', Icon: Home },
  { id: 'other', labelKey: 'viewing.other', Icon: MoreHorizontal },
];

/**
 * Sélecteur léger « Où l'as-tu vu ? », partagé par l'ajout de film et le rewatch.
 *
 * Volontairement minimal : deux rangées de puces, rien n'est obligatoire, et
 * l'absence de réponse laisse simplement le contexte indéfini. Le paiement n'est
 * demandé que si la séance a eu lieu au cinéma.
 */
const ViewingContextPicker: React.FC<ViewingContextPickerProps> = ({
  value,
  onChange,
  subscription,
  showLabel = true,
}) => {
  const { t } = useLanguage();
  const subscriptionBrand = subscription ? getCinemaProviderBrand(subscription.provider) : null;

  const payments: { id: CinemaViewingPaymentType; labelKey: string }[] = [
    ...(subscription
      ? [{ id: 'subscription' as const, labelKey: 'viewing.withSubscription' }]
      : []),
    { id: 'paid', labelKey: 'viewing.paid' },
    { id: 'invitation', labelKey: 'viewing.invitation' },
    { id: 'other', labelKey: 'viewing.otherPayment' },
  ];

  const pickLocation = (id: ViewingLocationType) => {
    haptics.soft();
    // Retoucher le même choix efface la réponse : rien n'est imposé.
    if (value?.locationType === id) {
      onChange(undefined);
      return;
    }
    onChange(
      id === 'cinema'
        ? { locationType: 'cinema', cinemaProvider: subscription?.provider ?? 'other' }
        : { locationType: id }
    );
  };

  const pickPayment = (id: CinemaViewingPaymentType) => {
    haptics.soft();
    const isSubscription = id === 'subscription' && !!subscription;
    onChange({
      locationType: 'cinema',
      cinemaProvider: isSubscription ? subscription.provider : (value?.cinemaProvider ?? 'other'),
      paymentType: id,
      subscriptionId: isSubscription ? subscription.id : undefined,
    });
  };

  const chip = (active: boolean, isSubscriptionChoice = false) =>
    `flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${subscriptionBrand?.fontClass ?? ''} ${
      active
        ? isSubscriptionChoice && subscriptionBrand
          ? `${subscriptionBrand.selectedClass} shadow-sm`
          : 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal border-charcoal dark:border-bitter-lime shadow-sm'
        : subscriptionBrand
          ? subscriptionBrand.secondaryPillClass
          : 'bg-white dark:bg-[#202020] text-stone-400 dark:text-stone-500 border-stone-200 dark:border-white/10'
    }`;

  return (
    <div className="space-y-3">
      {showLabel && (
        <label className={`text-[10px] font-black uppercase tracking-[0.2em] block ml-1 ${subscriptionBrand?.labelClass ?? 'text-stone-400 dark:text-stone-600'}`}>
          {t('viewing.question')}
        </label>
      )}

      {/* Plafonné : ces puces sont en flex-1 et ce composant est embarqué dans
          trois modales, qui viennent de gagner en largeur. Sans limite, chacune
          deviendrait une pastille de 250px pour un seul mot. */}
      <div className="flex gap-2 tab:max-w-md">
        {LOCATIONS.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => pickLocation(id)}
            className={chip(value?.locationType === id)}
          >
            <Icon size={13} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {value?.locationType === 'cinema' && (
        <div className="flex flex-wrap gap-2 animate-[fadeIn_0.2s_ease-out]">
          {subscription && <CinemaProviderBadge provider={subscription.provider} size="sm" />}
          {payments.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => pickPayment(id)}
              className={`${chip(value.paymentType === id, id === 'subscription')} flex-none px-3`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ViewingContextPicker;
