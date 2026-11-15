import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Ticket } from 'lucide-react';
import { FavoriteCinema } from '../types';
import { buildShowtimeSources, shortCinemaName } from '../utils/favoriteCinemas';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { ShowtimesSheet } from './ShowtimesList';
import { useMyPlaces } from '../services/myScreenings';
import { placeWhen } from './MyPlacePill';

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
 * Sur la fiche film : l'entrée vers le programme du film dans mes cinémas.
 * Le programme lui-même s'ouvre en feuille, aux couleurs de l'affiche.
 */
const MovieShowtimes: React.FC<MovieShowtimesProps> = ({ favoriteCinemas = [], onManageCinemas, ...rest }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const sources = useMemo(() => buildShowtimeSources(favoriteCinemas), [favoriteCinemas]);
  const names = sources.map((s) => shortCinemaName(s.cinema.name)).join(' · ');
  // Déjà ma place pour ce film : la carte le dit d'abord, le programme reste à un toucher.
  const place = useMyPlaces(rest.profileId).get(rest.tmdbId);

  return (
    <div className="mb-8">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">
        {sources.length ? t('showtimes.section') : t('showtimes.sectionEmpty')}
      </h3>
      <button
        onClick={() => {
          haptics.soft();
          if (!sources.length && !place && onManageCinemas) onManageCinemas();
          else setOpen(true);
        }}
        className="flex w-full items-center gap-3.5 rounded-[22px] bg-charcoal px-4 py-3.5 text-left text-white transition active:scale-[0.99] dark:bg-white/[0.07]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-bitter-lime text-charcoal">
          <Ticket size={18} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black tracking-[-0.01em]">
            {place
              ? `${t('place.yours')} · ${placeWhen(place, t('place.locale'))}`
              : sources.length
                ? t('showtimes.seeProgramme')
                : t('showtimes.empty.cta')}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white/60">
            {place ? [place.cinemaName, t('showtimes.seeProgramme')].filter(Boolean).join(' · ') : sources.length ? names : t('showtimes.empty.body')}
          </span>
        </span>
        <ArrowUpRight size={18} className="shrink-0 text-white/50" />
      </button>
      {open && (
        <ShowtimesSheet
          title={rest.titles[0] ?? ''}
          sources={sources}
          onManageCinemas={
            onManageCinemas
              ? () => {
                  setOpen(false);
                  onManageCinemas();
                }
              : undefined
          }
          onClose={() => setOpen(false)}
          {...rest}
        />
      )}
    </div>
  );
};

export default MovieShowtimes;
