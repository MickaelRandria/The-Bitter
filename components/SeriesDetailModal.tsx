import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pause, Play, Star, X } from 'lucide-react';
import { Movie, TvProgress, TvWatchState } from '../types';
import { TmdbSeasonSummary, TmdbSeriesDetails, getSeriesDetails } from '../services/tmdb';
import { getDisplayWeightedRating, getSeriesRating, hasVerdict } from '../utils/rating';
import { seasonsOf } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface Props {
  /** La ligne-série : l'œuvre entière, sans `seasonNumber`. */
  series: Movie;
  /** Toutes les œuvres du profil — les saisons en sont extraites ici. */
  allMovies: Movie[];
  onClose: () => void;
  /** Ouvre la grille Bitter+ sur une saison, existante ou non. */
  onRateSeason: (season: TmdbSeasonSummary) => void;
  onUpdateProgress: (progress: TvProgress) => void;
}

const STATE_ORDER: TvWatchState[] = ['planned', 'watching', 'paused', 'dropped', 'completed'];

/**
 * La fiche d'une série.
 *
 * Elle répond dans cet ordre à trois questions : où j'en suis, ce que j'en
 * pense, et ce que valent les saisons. La progression passe donc avant la note —
 * c'est ce qu'on vient chercher quand on rouvre une série en cours, alors qu'un
 * verdict se consulte rarement deux fois.
 *
 * **Les épisodes ne sont pas chargés.** La progression est un marque-page
 * (« j'en suis à S2E4 »), pas une liste de cases à cocher : une série longue
 * représente plusieurs centaines d'épisodes, dont le détail coûterait cher à
 * télécharger et ferait gonfler le profil stocké localement. Le modèle les
 * accueille déjà (`lastSeason`/`lastEpisode`) le jour où on les affichera.
 */
const SeriesDetailModal: React.FC<Props> = ({
  series,
  allMovies,
  onClose,
  onRateSeason,
  onUpdateProgress,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, series.title);

  const [tmdb, setTmdb] = useState<TmdbSeriesDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const progress = series.tvProgress;
  const [draftSeason, setDraftSeason] = useState(progress?.lastSeason ?? 1);
  const [draftEpisode, setDraftEpisode] = useState(progress?.lastEpisode ?? 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const details = series.tmdbId != null ? await getSeriesDetails(series.tmdbId) : null;
      if (cancelled) return;
      setTmdb(details);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [series.tmdbId]);

  /** Les saisons que la personne a déjà notées, indexées par numéro. */
  const ratedByNumber = useMemo(() => {
    const mine = seasonsOf(allMovies, series.tmdbId);
    return new Map(mine.map((season) => [season.seasonNumber as number, season]));
  }, [allMovies, series.tmdbId]);

  const seriesRating = useMemo(
    () => getSeriesRating([...ratedByNumber.values()]),
    [ratedByNumber]
  );

  /**
   * Le verdict historique, s'il existe.
   *
   * Les séries notées avant le suivi par saison portent leur note sur la
   * ligne-série. On la conserve telle quelle, libellée « avis global » : la
   * transformer en verdict de saison 1 affirmerait quelque chose que personne
   * n'a dit.
   */
  const legacyVerdict = hasVerdict(series) ? getDisplayWeightedRating(series) : null;

  const commitProgress = (patch: Partial<TvProgress>) => {
    haptics.soft();
    onUpdateProgress({
      state: 'watching',
      ...progress,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const markSeasonWatched = (seasonNumber: number) => {
    const already = progress?.seasonsWatched ?? [];
    const next = already.includes(seasonNumber)
      ? already.filter((n) => n !== seasonNumber)
      : [...already, seasonNumber].sort((a, b) => a - b);
    commitProgress({ seasonsWatched: next });
  };

  const state: TvWatchState = progress?.state ?? 'planned';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[280] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative h-32 shrink-0 bg-stone-200 dark:bg-[#161616] overflow-hidden">
          {series.posterUrl && (
            <img
              src={resizeTmdbImage(series.posterUrl, 'w500')}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] to-transparent" />

          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>

          <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
            <p className="text-lg font-black text-charcoal dark:text-white leading-tight line-clamp-2">
              {series.title}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 space-y-6">
          {/* 1 — Où j'en suis. En premier : c'est ce qu'on vient chercher. */}
          <section>
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              {t('series.progress')}
            </p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {STATE_ORDER.map((option) => (
                <button
                  key={option}
                  onClick={() => commitProgress({ state: option })}
                  aria-pressed={state === option}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                    state === option
                      ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal'
                      : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-500 border border-sand dark:border-white/10'
                  }`}
                >
                  {t(`series.state.${option}`)}
                </button>
              ))}
            </div>

            {/* Le marque-page. Deux champs et non une liste d'épisodes :
                « j'en suis là » se saisit en trois secondes. */}
            <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-2xl p-3 flex items-end gap-3">
              <label className="flex-1">
                <span className="block text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-1">
                  {t('series.season')}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draftSeason}
                  onChange={(e) => setDraftSeason(Number(e.target.value))}
                  className="w-full bg-transparent text-lg font-black text-charcoal dark:text-white tabular-nums outline-none"
                />
              </label>
              <label className="flex-1">
                <span className="block text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-1">
                  {t('series.episode')}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draftEpisode}
                  onChange={(e) => setDraftEpisode(Number(e.target.value))}
                  className="w-full bg-transparent text-lg font-black text-charcoal dark:text-white tabular-nums outline-none"
                />
              </label>
              <button
                onClick={() =>
                  commitProgress({ lastSeason: draftSeason, lastEpisode: draftEpisode })
                }
                className="px-4 py-2 rounded-xl bg-forest text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
              >
                {t('series.saveProgress')}
              </button>
            </div>

            {progress?.lastSeason != null && (
              <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                {state === 'paused' ? <Pause size={12} /> : <Play size={12} />}
                {t('series.resumeAt', {
                  season: progress.lastSeason,
                  episode: progress.lastEpisode ?? 1,
                })}
              </p>
            )}
          </section>

          {/* 2 — Ce que j'en pense. */}
          <section>
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              {t('series.myVerdict')}
            </p>
            {seriesRating ? (
              <div>
                <p className="text-3xl font-black text-charcoal dark:text-white tabular-nums leading-none">
                  {seriesRating.average.toFixed(1)}
                  <span className="text-base text-stone-400 dark:text-stone-600">/10</span>
                </p>
                {/* Le libellé n'est pas décoratif : sans lui, cette moyenne se
                    lirait comme une note posée par la personne. */}
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                  {t('series.averageOf', { count: seriesRating.ratedSeasons })}
                </p>
              </div>
            ) : legacyVerdict != null ? (
              <div>
                <p className="text-3xl font-black text-charcoal dark:text-white tabular-nums leading-none">
                  {legacyVerdict.toFixed(1)}
                  <span className="text-base text-stone-400 dark:text-stone-600">/10</span>
                </p>
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                  {t('series.globalVerdict')}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-stone-400 dark:text-stone-600">
                {t('series.noVerdictYet')}
              </p>
            )}
          </section>

          {/* 3 — Les saisons. */}
          <section>
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              {t('series.seasons')}
            </p>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-stone-300" size={22} />
              </div>
            ) : !tmdb || tmdb.seasons.length === 0 ? (
              /* Une panne TMDB ne doit pas vider l'écran : la progression et les
                 verdicts déjà enregistrés restent lisibles au-dessus. */
              <p className="text-[11px] text-stone-400 dark:text-stone-600">
                {t('series.seasonsUnavailable')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tmdb.seasons.map((season) => {
                  const mine = ratedByNumber.get(season.seasonNumber);
                  const watched = progress?.seasonsWatched?.includes(season.seasonNumber) ?? false;
                  return (
                    <li
                      key={season.id}
                      className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-2xl px-3 py-2.5 flex items-center gap-3"
                    >
                      <button
                        onClick={() => markSeasonWatched(season.seasonNumber)}
                        aria-pressed={watched}
                        aria-label={t('series.markSeasonWatched', { name: season.name })}
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border transition-all ${
                          watched
                            ? 'bg-forest border-forest text-white'
                            : 'border-sand dark:border-white/15 text-transparent'
                        }`}
                      >
                        <Check size={14} strokeWidth={3} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-charcoal dark:text-white truncate">
                          {season.name}
                        </p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-600">
                          {t('series.episodeCount', { count: season.episodeCount })}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          haptics.soft();
                          onRateSeason(season);
                        }}
                        className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                          mine && hasVerdict(mine)
                            ? 'bg-sand/70 dark:bg-[#252525] text-charcoal dark:text-white'
                            : 'bg-charcoal dark:bg-white text-white dark:text-charcoal'
                        }`}
                      >
                        {mine && hasVerdict(mine) ? (
                          <>
                            <Star size={11} strokeWidth={3} />
                            {getDisplayWeightedRating(mine).toFixed(1)}
                          </>
                        ) : (
                          t('series.rateSeason')
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SeriesDetailModal;
