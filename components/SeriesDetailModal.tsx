import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, History, Loader2, Pencil, Play, Star, Trash2, X } from 'lucide-react';
import { Movie, TvEpisodeEntry, TvProgress, TvWatchState } from '../types';
import { TmdbSeasonSummary, TmdbSeriesDetails, getSeriesDetails } from '../services/tmdb';
import { getDisplayWeightedRating, getSeriesRating, hasVerdict, seasonScores } from '../utils/rating';
import { seasonsOf } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import SeasonEpisodes from './SeasonEpisodes';
import SeriesRecap from './SeriesRecap';
import SeriesHeatmap from './SeriesHeatmap';
import FriendsSeriesProgress from './FriendsSeriesProgress';
import { getWatchOffers } from '../services/tv';
import { getNetflixUrl } from '../services/streamingLinks';
import { groupWatchOffers, hasNetflix } from '../utils/watchOffers';
import { EpisodePosition, furthestPosition, nextEpisode } from '../utils/upNext';
import { progressFromLastSeen } from '../utils/episodeCompanion';
import EpisodePicker from './EpisodePicker';

interface Props {
  initialSeason?: number;
  /** La ligne-série : l'œuvre entière, sans `seasonNumber`. */
  series: Movie;
  /** Toutes les œuvres du profil — les saisons en sont extraites ici. */
  allMovies: Movie[];
  onClose: () => void;
  /** Ouvre la grille Bitter+ sur une saison, existante ou non. */
  onRateSeason: (season: TmdbSeasonSummary) => void;
  onUpdateProgress: (progress: TvProgress) => void;
  /** Retire la série de la collection, avec le même « Annuler » que le geste de glissement. */
  onDelete?: () => void;
  /** Ouvre le mode épisode sur le prochain épisode, comme la carte « À suivre ». */
  onLaunch?: () => void;
}

const STATE_ORDER: TvWatchState[] = ['planned', 'watching', 'paused', 'dropped', 'completed'];

/**
 * La fiche d'une série.
 *
 * Dans l'ordre : où j'en suis et le bouton pour lancer la suite, la carte des
 * épisodes, puis les saisons, repliées. C'est ce qu'on vient chercher quand on
 * rouvre une série en cours ; un verdict se consulte rarement deux fois.
 *
 * Les épisodes d'une saison sont chargés quand on la déplie.
 */
const SeriesDetailModal: React.FC<Props> = ({
  series,
  initialSeason,
  allMovies,
  onClose,
  onRateSeason,
  onUpdateProgress,
  onDelete,
  onLaunch,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, series.title);

  const [tmdb, setTmdb] = useState<TmdbSeriesDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(initialSeason ?? null);

  const progress: TvProgress | undefined = series.tvProgress;
  /** « Changer ma place » : le même choix d'épisode que « Tu en es où ? ». */
  const [editingPlace, setEditingPlace] = useState(false);
  const [picked, setPicked] = useState<EpisodePosition | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [netflixUrl, setNetflixUrl] = useState<string | null>(null);

  // Le lien direct, pour une série que TMDB voit sur Netflix en France.
  useEffect(() => {
    if (series.tmdbId == null) return;
    let active = true;
    const id = series.tmdbId;
    getWatchOffers('tv', id)
      .then((offers) => (hasNetflix(groupWatchOffers(offers)) ? getNetflixUrl('tv', id) : null))
      .catch(() => null)
      .then((url) => active && setNetflixUrl(url));
    return () => {
      active = false;
    };
  }, [series.tmdbId]);

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
    () => getSeriesRating([...ratedByNumber.values()], progress),
    [ratedByNumber, progress]
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
    const watched = next.includes(seasonNumber);
    const episodes = Object.fromEntries(Object.entries(progress?.episodes ?? {}).map(([key, entry]) => [key,
      entry.seasonNumber === seasonNumber ? { ...entry, watched, watchedAt: watched ? entry.watchedAt : undefined, updatedAt: Date.now() } : entry,
    ]));
    commitProgress({ seasonsWatched: next, episodes });
  };

  const state: TvWatchState = progress?.state ?? 'planned';
  const furthest = tmdb ? furthestPosition(progress, tmdb.seasons) : null;
  // Le récap n'a de sens qu'une fois la série commencée.
  const started = furthest != null && furthest.episode > 0;
  const next = tmdb ? nextEpisode(progress, tmdb.seasons) : null;
  const ended = tmdb?.productionStatus === 'Ended' || tmdb?.productionStatus === 'Canceled';

  /** Une saison se note une fois vue : cochée, dépassée, ou la série finie. */
  const seasonSeen = (seasonNumber: number) =>
    state === 'completed' ||
    (progress?.seasonsWatched ?? []).includes(seasonNumber) ||
    (furthest != null && furthest.season > seasonNumber);

  const openPlaceEditor = () => {
    haptics.soft();
    setPicked(started ? furthest : null);
    setEditingPlace((open) => !open);
  };

  const savePlace = () => {
    if (!tmdb) return;
    haptics.success();
    onUpdateProgress(progressFromLastSeen(progress, picked, tmdb.seasons, { ended }));
    setEditingPlace(false);
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[280] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative h-32 shrink-0 bg-stone-200 dark:bg-[#161616] overflow-hidden">
          {(tmdb?.backdropUrl ?? series.posterUrl) && (
            <img
              src={resizeTmdbImage(tmdb?.backdropUrl ?? series.posterUrl, tmdb?.backdropUrl ? 'w780' : 'w500')}
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
          {/* 1 — Où j'en suis, et la suite à lancer. C'est ce qu'on vient chercher. */}
          <section>
            <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              {t('series.progress')}
            </p>

            {tmdb && (
              <div data-tour="sheet-next" className="rounded-3xl bg-charcoal p-4 text-white dark:bg-[#1a1a1a]">
                {next && state !== 'completed' ? (
                  <>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/50">
                      {t(started ? 'series.nextEpisode' : 'series.firstEpisode')}
                    </p>
                    <p className="mt-0.5 text-xl font-black tabular-nums">
                      {t('series.episodeLabel', { season: next.season, episode: next.episode })}
                    </p>
                    {onLaunch && (
                      <button
                        onClick={() => {
                          haptics.medium();
                          onLaunch();
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime py-3.5 text-[11px] font-black uppercase tracking-widest text-black transition-transform active:scale-[0.98]"
                      >
                        <Play size={14} fill="currentColor" />
                        {t('upNext.launch')}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-black">{t('series.upToDate')}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {netflixUrl && (
                    <a
                      href={netflixUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => haptics.medium()}
                      className="flex items-center gap-1.5 rounded-xl bg-[#E50914] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-transform active:scale-95"
                    >
                      <Play size={12} fill="currentColor" />
                      {t('series.watchOnNetflix')}
                    </a>
                  )}
                  {started && (
                    <button
                      onClick={() => {
                        haptics.soft();
                        setRecapOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/80 transition-transform active:scale-95"
                    >
                      <History size={12} strokeWidth={2.5} />
                      {t('upNext.previously')}
                    </button>
                  )}
                  <button
                    onClick={openPlaceEditor}
                    data-tour="sheet-place"
                    aria-expanded={editingPlace}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/80 transition-transform active:scale-95"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                    {t('series.editPlace')}
                  </button>
                </div>
              </div>
            )}

            {/* Le marque-page : le dernier épisode vu, d'un geste, sans titre qui
                gâcherait la suite. Le même choix que « Tu en es où ? ». */}
            {editingPlace && tmdb && (
              <div className="mt-3 rounded-3xl border border-sand bg-white px-6 py-4 dark:border-white/10 dark:bg-[#141414]">
                <p className="mb-3 text-[11px] text-stone-500 dark:text-stone-400">{t('bookmark.hint')}</p>
                <EpisodePicker
                  seasons={tmdb.seasons}
                  value={picked}
                  onChange={setPicked}
                  initialSeason={furthest?.season ?? progress?.lastSeason}
                />
                <button
                  onClick={savePlace}
                  className="mt-4 w-full rounded-2xl bg-forest py-3 text-[10px] font-black uppercase tracking-widest text-white transition-transform active:scale-[0.98]"
                >
                  {picked
                    ? t('bookmark.save', { season: picked.season, episode: picked.episode })
                    : t('bookmark.notStarted')}
                </button>
              </div>
            )}

            <div data-tour="sheet-state" className="mt-3 flex flex-wrap gap-1.5">
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
          </section>

          {/* 2 — La carte de la série : la note du public, épisode par épisode. */}
          {series.tmdbId != null && tmdb && tmdb.seasons.length > 0 && (
            <SeriesHeatmap tmdbId={series.tmdbId} seasons={tmdb.seasons} progress={progress} />
          )}
          {series.tmdbId != null && tmdb && (
            <FriendsSeriesProgress seriesTmdbId={series.tmdbId} seasons={tmdb.seasons} progress={progress} />
          )}

          {/* Ce que j'en pense. */}
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

          {/* 3 — Les saisons, repliées : on déplie celle qu'on veut. */}
          <section data-tour="sheet-seasons">
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
                  /* La moyenne des épisodes se lit saison repliée : sans elle, une
                     saison notée épisode par épisode paraîtrait vierge tant qu'on
                     ne l'a pas dépliée. */
                  const episodesAverage = seasonScores(
                    mine,
                    Object.values<TvEpisodeEntry>(progress?.episodes ?? {}),
                    season.seasonNumber
                  ).episodes?.average;
                  return (
                    <li
                      key={season.id}
                      className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-2xl px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
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

                      {/* Le chevron dit seul que la ligne s'ouvre : répéter
                          « Épisodes » après « 8 épisode(s) » n'ajoutait rien. Le
                          libellé complet reste pour les lecteurs d'écran. */}
                      <button
                        className="flex-1 min-w-0 text-left py-3 flex items-center gap-2"
                        aria-expanded={expandedSeason === season.seasonNumber}
                        aria-label={t('tv.showEpisodes', { name: season.name })}
                        onClick={() =>
                          setExpandedSeason(
                            expandedSeason === season.seasonNumber ? null : season.seasonNumber
                          )
                        }
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-bold text-charcoal dark:text-white truncate">
                            {season.name}
                          </span>
                          <span className="block text-[10px] text-stone-400 dark:text-stone-600">
                            {t('series.episodeCount', { count: season.episodeCount })}
                            {episodesAverage != null &&
                              ` · ${t('tv.averageShort', { rating: episodesAverage.toFixed(1) })}`}
                          </span>
                        </span>
                        <ChevronDown
                          size={14}
                          className={`shrink-0 text-stone-400 transition-transform ${expandedSeason === season.seasonNumber ? 'rotate-180' : ''}`}
                        />
                      </button>

                      <button
                        onClick={() => {
                          haptics.soft();
                          onRateSeason(season);
                        }}
                        className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                          mine && hasVerdict(mine)
                            ? 'bg-sand/70 dark:bg-[#252525] text-charcoal dark:text-white'
                            : seasonSeen(season.seasonNumber)
                              ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal'
                              : 'border border-sand dark:border-white/10 text-stone-400 dark:text-stone-500'
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
                      </div>
                      {expandedSeason === season.seasonNumber && (
                        <SeasonEpisodes
                          key={season.seasonNumber}
                          series={series}
                          season={season.seasonNumber}
                          seasonMovie={mine}
                          onUpdate={onUpdateProgress}
                          onRateSeason={() => {
                            haptics.soft();
                            onRateSeason(season);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {/* Ajoutée par erreur : le glissement sur la carte n'était pas le seul
              moyen qu'on cherche. Le bouton passe par la même suppression, avec
              son « Annuler ». */}
          {onDelete && (
            <section className="border-t border-sand pt-5 dark:border-white/10">
              <button
                onClick={onDelete}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 py-3.5 text-[10px] font-black uppercase tracking-widest text-red-500 transition-transform active:scale-[0.98] dark:border-red-500/20 dark:text-red-400"
              >
                <Trash2 size={14} strokeWidth={2.5} />
                {t('series.delete')}
              </button>
              <p className="mt-2 text-center text-[10px] text-stone-400 dark:text-stone-500">
                {t('series.deleteHint')}
              </p>
            </section>
          )}
        </div>
      </div>

      {recapOpen && tmdb && (
        <SeriesRecap series={series} seasons={tmdb.seasons} onClose={() => setRecapOpen(false)} />
      )}
    </div>
  );
};

export default SeriesDetailModal;
