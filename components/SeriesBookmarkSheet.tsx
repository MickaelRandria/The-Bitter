import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { Movie, TvProgress } from '../types';
import { getSeriesDetails, TmdbSeriesDetails } from '../services/tmdb';
import { progressFromLastSeen } from '../utils/episodeCompanion';
import { EpisodePosition } from '../utils/upNext';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import EpisodePicker from './EpisodePicker';

interface Props {
  series: Movie;
  onSave: (progress: TvProgress) => void;
  onClose: () => void;
  onOpenSeries: () => void;
}

/**
 * « Tu en es où ? » : dire sa place dans une série en deux gestes, une saison
 * puis un épisode, sans passer par la fiche.
 *
 * C'est la porte d'entrée de « À suivre » : sans place déclarée, rien à
 * proposer. Relevé le 30 septembre 2026, 14 séries sur 15 n'en avaient aucune,
 * et la fiche complète rangeait le marque-page sous la liste des saisons.
 *
 * Seulement des numéros : le titre d'un épisode non vu est un spoiler.
 */
const SeriesBookmarkSheet: React.FC<Props> = ({ series, onSave, onClose, onOpenSeries }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('bookmark.title'));
  const [details, setDetails] = useState<TmdbSeriesDetails | null | undefined>(undefined);
  const [lastSeen, setLastSeen] = useState<EpisodePosition | null>(null);

  useEffect(() => {
    let active = true;
    (series.tmdbId != null ? getSeriesDetails(series.tmdbId) : Promise.resolve(null))
      .catch(() => null)
      .then((value) => active && setDetails(value));
    return () => {
      active = false;
    };
  }, [series.tmdbId]);

  const hasSeasons = (details?.seasons ?? []).some((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const ended = details?.productionStatus === 'Ended' || details?.productionStatus === 'Canceled';

  const save = (position: EpisodePosition | null) => {
    if (!details) return;
    haptics.success();
    onSave(progressFromLastSeen(series.tvProgress, position, details.seasons, { ended }));
    onClose();
  };

  const image = details?.backdropUrl ?? series.posterUrl;

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[290] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.25s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative h-32 shrink-0 overflow-hidden bg-charcoal">
          {image && (
            <img
              src={resizeTmdbImage(image, 'w780')}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] via-cream/30 dark:via-[#0c0c0c]/30 to-transparent" />
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              {series.title}
            </p>
            <p className="text-2xl font-black tracking-tight text-charcoal dark:text-white">
              {t('bookmark.title')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-5">
          <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
            {t('bookmark.hint')}
          </p>

          {details === undefined ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-stone-300" size={22} />
            </div>
          ) : !hasSeasons ? (
            <p className="rounded-2xl bg-stone-100 px-4 py-3 text-[11px] text-stone-500 dark:bg-white/5 dark:text-stone-400">
              {t('bookmark.unavailable')}
            </p>
          ) : (
            <EpisodePicker
              seasons={details!.seasons}
              value={lastSeen}
              onChange={setLastSeen}
              initialSeason={series.tvProgress?.lastSeason}
            />
          )}

          <div className="space-y-2">
            <button
              disabled={lastSeen == null}
              onClick={() => lastSeen && save(lastSeen)}
              className="w-full rounded-2xl bg-forest py-4 text-[11px] font-black uppercase tracking-widest text-white transition-all active:scale-[0.98] disabled:opacity-40 dark:bg-bitter-lime dark:text-black"
            >
              {lastSeen
                ? t('bookmark.save', { season: lastSeen.season, episode: lastSeen.episode })
                : t('bookmark.pick')}
            </button>
            <div className="flex items-center justify-between gap-3">
              <button
                disabled={!details}
                onClick={() => save(null)}
                className="py-2 text-[10px] font-black uppercase tracking-widest text-stone-400 disabled:opacity-40 dark:text-stone-500"
              >
                {t('bookmark.notStarted')}
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenSeries();
                }}
                className="flex items-center gap-0.5 py-2 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500"
              >
                {t('bookmark.fullSheet')}
                <ChevronRight size={12} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeriesBookmarkSheet;
