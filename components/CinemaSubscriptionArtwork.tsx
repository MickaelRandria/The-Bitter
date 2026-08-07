import React from 'react';
import { Ticket } from 'lucide-react';
import { CinemaSubscriptionProvider } from '../types';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';

interface CinemaSubscriptionArtworkProps {
  provider: CinemaSubscriptionProvider;
  size?: 'selector' | 'thumbnail' | 'compact';
}

const CARD_IMAGE_URLS: Partial<Record<CinemaSubscriptionProvider, string>> = {
  ugc: '/cin%C3%A9ma/carte-ugc-transparent.png',
  pathe: '/cin%C3%A9ma/CinePass-Pathe.png',
};

const SIZE_CLASSES = {
  selector: 'w-28 aspect-[1.7/1] rounded-xl',
  thumbnail: 'w-16 h-10 rounded-lg',
  compact: 'w-10 h-7 rounded-lg',
};

/** Visuel de carte fourni par l'utilisateur, sans le déformer. */
const CinemaSubscriptionArtwork: React.FC<CinemaSubscriptionArtworkProps> = ({
  provider,
  size = 'thumbnail',
}) => {
  const src = CARD_IMAGE_URLS[provider];
  const brand = getCinemaProviderBrand(provider);

  if (!src) {
    return (
      <div
        aria-label={brand.label}
        className={`flex items-center justify-center shrink-0 border ${SIZE_CLASSES[size]} ${brand.subtleClass}`}
      >
        <Ticket size={size === 'selector' ? 20 : 13} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden shrink-0 bg-transparent ${SIZE_CLASSES[size]}`}>
      <img
        src={src}
        alt={`Carte ${brand.label}`}
        loading={size === 'selector' ? 'eager' : 'lazy'}
        decoding="async"
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default CinemaSubscriptionArtwork;
