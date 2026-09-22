import React from 'react';
import { Star } from 'lucide-react';
import { PublicRating } from '../utils/publicRating';

/** Le logotype IMDb : texte noir gras sur son jaune, reconnaissable d'un coup d'œil. */
export const ImdbMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center rounded-[3px] bg-[#F5C518] px-1 font-black leading-none tracking-tight text-black ${className}`}
    aria-label="IMDb"
  >
    IMDb
  </span>
);

/**
 * Note du public en format compact, pour les listes.
 *
 * IMDb porte son logotype ; TMDB, en repli, garde l'étoile de l'app avec la
 * mention de sa source, pour que les deux ne se confondent jamais.
 */
const PublicRatingBadge: React.FC<{ rating: PublicRating | null; className?: string }> = ({
  rating,
  className = '',
}) => {
  if (!rating) return null;
  if (rating.source === 'imdb') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <ImdbMark className="text-[8px] py-[2px]" />
        <span className="text-[10px] font-black">{rating.value.toFixed(1)}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title="Note TMDB">
      <Star size={10} fill="currentColor" />
      <span className="text-[10px] font-black">{rating.value.toFixed(1)}</span>
    </span>
  );
};

export default PublicRatingBadge;
