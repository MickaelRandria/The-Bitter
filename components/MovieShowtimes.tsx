import React, { useMemo } from 'react';
import { FavoriteCinema } from '../types';
import { buildShowtimeSources } from '../utils/favoriteCinemas';
import { useLanguage } from '../contexts/LanguageContext';
import { ShowtimesList } from './ShowtimesList';

interface MovieShowtimesProps {
  tmdbId: number;
  /** Titre français puis titre original : UGC affiche parfois l'un, parfois l'autre. */
  titles: string[];
  posterUrl?: string;
  profileId?: string;
  /** Mes cinémas, dans mon ordre. */
  favoriteCinemas?: FavoriteCinema[];
  releaseDate?: string;
  onManageCinemas?: () => void;
  onToast?: (message: string) => void;
}

/**
 * Les séances du film dans mes cinémas, sur sa fiche : la même liste repliée
 * jour par jour que la feuille ouverte depuis une liste « à voir ».
 */
const MovieShowtimes: React.FC<MovieShowtimesProps> = ({ favoriteCinemas = [], ...rest }) => {
  const { t } = useLanguage();
  const sources = useMemo(() => buildShowtimeSources(favoriteCinemas), [favoriteCinemas]);
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">
          {sources.length ? t('showtimes.section') : t('showtimes.sectionEmpty')}
        </h3>
        {sources.length > 0 && (
          <span className="truncate text-[10px] font-bold text-stone-500 dark:text-stone-400">
            {sources.length === 1 ? sources[0].cinema.name : t('showtimes.inMine', { n: String(sources.length) })}
          </span>
        )}
      </div>
      <ShowtimesList sources={sources} {...rest} />
    </div>
  );
};

export default MovieShowtimes;
