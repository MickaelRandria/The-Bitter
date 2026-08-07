import React from 'react';
import { CinemaSubscriptionProvider } from '../types';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';

interface CinemaProviderBadgeProps {
  provider: CinemaSubscriptionProvider;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-7 min-w-7 px-2 text-[8px] tracking-[0.14em] rounded-lg',
  md: 'h-9 min-w-9 px-2.5 text-[10px] tracking-[0.12em] rounded-xl',
  lg: 'h-11 min-w-11 px-3 text-[11px] tracking-[0.12em] rounded-2xl',
};

/** Badge de marque réutilisable dans les parcours abonnement et notation. */
const CinemaProviderBadge: React.FC<CinemaProviderBadgeProps> = ({
  provider,
  size = 'md',
  className = '',
}) => {
  const brand = getCinemaProviderBrand(provider);

  return (
    <span
      role="img"
      aria-label={brand.label}
      className={`inline-flex items-center justify-center border font-black uppercase shadow-sm shrink-0 ${SIZE_CLASSES[size]} ${brand.fontClass} ${brand.badgeClass} ${className}`}
    >
      {brand.label}
    </span>
  );
};

export default CinemaProviderBadge;
