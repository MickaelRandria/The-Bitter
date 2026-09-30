import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, History, Play, Star } from 'lucide-react';
import { Movie, TvEpisodeEntry, TvProgress } from '../types';
import { getSeriesDetails, TmdbSeasonSummary } from '../services/tmdb';
import { getSeasonEpisodes, getWatchOffers, TvEpisode } from '../services/tv';
import { getNetflixUrl } from '../services/streamingLinks';
import {
  EpisodePosition,
  FOLLOWED_STATES,
  formatDuration,
  furthestPosition,
  nextEpisode,
  remainingInSeason,
} from '../utils/upNext';
import { localDate, updateEpisode } from '../utils/tvProgress';
import { groupWatchOffers, hasNetflix } from '../utils/watchOffers';
import { hasVerdict } from '../utils/rating';
import { seasonsOf } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import SeriesRecap from './SeriesRecap';

interface Props {
  /** Toutes les œuvres du profil : les séries suivies et leurs saisons notées en sont tirées. */
  movies: Movie[];
  onUpdateProgress: (series: Movie, progress: TvProgress) => void;
  onOpenSeries: (series: Movie) => void;
  onRateSeason: (series: Movie, season: TmdbSeasonSummary) => void;
}

interface UpNextItem {
  series: Movie;
  seasons: TmdbSeasonSummary[];
  /** Terminée ou annulée selon TMDB : plus rien ne viendra après le dernier épisode. */
  ended: boolean;
  next: EpisodePosition;
  episode?: TvEpisode;
  available: boolean;
  remaining: { count: number; minutes: number };
  netflixUrl: string | null;
  /** Reprise après une pause ou à l'entrée d'une nouvelle saison : le récap sert. */
  resuming: boolean;
}

interface LastAction {
  seriesId: string;
  before: TvProgress | undefined;
  position: EpisodePosition;
  /** La saison que cet épisode vient de terminer, si elle attend encore un verdict. */
  finishedSeason?: TmdbSeasonSummary;
}

/** Au-delà, la liste devient un inventaire : on montre les plus récentes. */
const MAX_FOLLOWED = 12;
const VISIBLE_AVAILABLE = 4;
const VISIBLE_UPCOMING = 3;
/** Sans épisode vu depuis ce délai, on reprend une série plutôt qu'on ne la continue. */
const RESUME_AFTER_DAYS = 10;

const todayInParis = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

const lastWatchedAt = (progress: TvProgress | undefined): string | undefined =>
  Object.values(progress?.episodes ?? {})
    .filter((e) => e.watched && e.watchedAt)
    .map((e) => e.watchedAt as string)
    .sort()
    .pop();

async function loadItem(series: Movie, today: string): Promise<UpNextItem | null> {
  if (series.tmdbId == null) return null;
  const details = await getSeriesDetails(series.tmdbId);
  if (!details) return null;
  const next = nextEpisode(series.tvProgress, details.seasons);
  if (!next) return null;

  const [episodes, offers] = await Promise.all([
    getSeasonEpisodes(series.tmdbId, next.season).catch(() => [] as TvEpisode[]),
    getWatchOffers('tv', series.tmdbId).catch(() => null),
  ]);
  const episode = episodes.find((e) => e.episodeNumber === next.episode);
  // Sans date, l'épisode n'est qu'annoncé : rien à regarder, rien à promettre.
  if (!episode?.airDate) return null;

  const available = episode.airDate <= today;
  const netflixUrl =
    available && hasNetflix(groupWatchOffers(offers))
      ? await getNetflixUrl('tv', series.tmdbId)
      : null;

  const last = lastWatchedAt(series.tvProgress);
  const daysSince = last ? (Date.parse(today) - Date.parse(last)) / 86_400_000 : Infinity;
  const started = furthestPosition(series.tvProgress, details.seasons) != null;

  return {
    series,
    seasons: details.seasons,
    ended: details.productionStatus === 'Ended' || details.productionStatus === 'Canceled',
    next,
    episode,
    available,
    remaining: remainingInSeason(episodes, next.episode, today),
    netflixUrl,
    resuming:
      started && (daysSince >= RESUME_AFTER_DAYS || (next.episode === 1 && next.season > 1)),
  };
}

/**
 * « À suivre » : le prochain épisode de chaque série en cours, cochable d'un geste.
 *
 * C'est ce qui remplace une synchronisation avec les plateformes, impossible
 * sans stocker les identifiants de chacun : on ne ressaisit rien, on coche en
 * sortant de l'épisode. Le titre de l'épisode n'est pas affiché — il n'est pas
 * encore vu, c'est donc un spoiler, comme partout ailleurs dans l'app.
 */
const UpNext: React.FC<Props> = ({ movies, onUpdateProgress, onOpenSeries, onRateSeason }) => {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<UpNextItem[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [recapFor, setRecapFor] = useState<UpNextItem | null>(null);

  const followed = useMemo(
    () =>
      movies
        .filter(
          (m) =>
            m.mediaType === 'tv' &&
            m.seasonNumber == null &&
            m.tmdbId != null &&
            m.tvProgress != null &&
            FOLLOWED_STATES.includes(m.tvProgress.state)
        )
        .sort((a, b) => (b.tvProgress?.updatedAt ?? 0) - (a.tvProgress?.updatedAt ?? 0))
        .slice(0, MAX_FOLLOWED),
    [movies]
  );
  // Recharger quand une progression change, pas à chaque rendu du fil.
  const followedKey = followed.map((s) => `${s.id}:${s.tvProgress?.updatedAt ?? 0}`).join('|');

  useEffect(() => {
    if (followed.length === 0) {
      setItems([]);
      return;
    }
    let active = true;
    const today = todayInParis();
    Promise.all(followed.map((series) => loadItem(series, today).catch(() => null))).then(
      (loaded) => {
        if (active) setItems(loaded.filter((item): item is UpNextItem => item != null));
      }
    );
    return () => {
      active = false;
    };
    // `followed` se déduit de la clé : la reprendre en dépendance rechargerait tout à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey]);

  if (followed.length === 0) return null;

  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const available = (items ?? []).filter((item) => item.available);
  const upcoming = (items ?? [])
    .filter((item) => !item.available)
    .sort((a, b) => (a.episode?.airDate ?? '').localeCompare(b.episode?.airDate ?? ''))
    .slice(0, VISIBLE_UPCOMING);
  const visible = expanded ? available : available.slice(0, VISIBLE_AVAILABLE);

  if (items && available.length === 0 && upcoming.length === 0 && !lastAction) return null;

  const markWatched = (item: UpNextItem) => {
    haptics.medium();
    const { series, next, seasons } = item;
    const before = series.tvProgress;
    const entry: TvEpisodeEntry = {
      seasonNumber: next.season,
      episodeNumber: next.episode,
      watched: true,
      watchedAt: localDate(),
      runtime: item.episode?.runtime,
      updatedAt: Date.now(),
    };
    const marked = updateEpisode(before, entry);
    const after = nextEpisode(marked, seasons);
    const progress: TvProgress = {
      ...marked,
      // Une série « terminée » dont une saison sort, ou mise en pause puis reprise, est de nouveau en cours.
      state: after == null && item.ended ? 'completed' : 'watching',
      // Le marque-page suit, sinon la fiche afficherait une place dépassée.
      lastSeason: after?.season ?? next.season,
      lastEpisode: after?.episode ?? next.episode + 1,
    };

    const season = seasons.find((s) => s.seasonNumber === next.season);
    const seasonDone = season != null && next.episode >= season.episodeCount;
    const alreadyRated = seasonsOf(movies, series.tmdbId).some(
      (m) => m.seasonNumber === next.season && hasVerdict(m)
    );
    setLastAction({
      seriesId: series.id,
      before,
      position: next,
      finishedSeason: seasonDone && !alreadyRated ? season : undefined,
    });
    onUpdateProgress(series, progress);
  };

  const undo = () => {
    if (!lastAction) return;
    const series = movies.find((m) => m.id === lastAction.seriesId);
    if (series) {
      haptics.soft();
      onUpdateProgress(series, { state: 'watching', ...lastAction.before, updatedAt: Date.now() });
    }
    setLastAction(null);
  };

  const actionSeries = lastAction ? movies.find((m) => m.id === lastAction.seriesId) : undefined;

  return (
    <section aria-labelledby="up-next-title" className="space-y-3">
      <p
        id="up-next-title"
        className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500"
      >
        {t('upNext.title')}
      </p>

      {lastAction && actionSeries && (
        <div
          role="status"
          className="rounded-2xl border border-forest/20 bg-forest/5 px-3.5 py-2.5 dark:border-bitter-lime/20 dark:bg-bitter-lime/5"
        >
          <div className="flex items-center gap-2 text-[11px] font-bold text-forest dark:text-bitter-lime">
            <Check size={13} strokeWidth={3} />
            <span className="min-w-0 flex-1 truncate">
              {actionSeries.title} ·{' '}
              {t('upNext.done', {
                season: lastAction.position.season,
                episode: lastAction.position.episode,
              })}
            </span>
            <button onClick={undo} className="shrink-0 py-1 underline underline-offset-2">
              {t('upNext.undo')}
            </button>
          </div>
          {lastAction.finishedSeason && (
            <button
              onClick={() => {
                haptics.soft();
                onRateSeason(actionSeries, lastAction.finishedSeason!);
                setLastAction(null);
              }}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-charcoal px-3 py-2.5 text-left text-[11px] font-black text-white dark:bg-white dark:text-charcoal"
            >
              <span>
                {t('upNext.seasonDone', { season: lastAction.finishedSeason.seasonNumber })}
              </span>
              <span className="flex shrink-0 items-center gap-1 uppercase tracking-widest text-[9px]">
                <Star size={11} strokeWidth={3} />
                {t('upNext.rateSeason')}
              </span>
            </button>
          )}
        </div>
      )}

      {items == null ? (
        <div className="h-[116px] animate-pulse rounded-2xl bg-stone-100 dark:bg-white/5" />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((item) => {
            const { series, next, episode, remaining } = item;
            const lastOfSeason = remaining.count <= 1;
            return (
              <li
                key={series.id}
                className="flex gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#1a1a1a]"
              >
                <button
                  onClick={() => onOpenSeries(series)}
                  aria-label={series.title}
                  className="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-xl bg-stone-200 dark:bg-[#252525]"
                >
                  {series.posterUrl && (
                    <img
                      src={resizeTmdbImage(series.posterUrl, 'w185')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onOpenSeries(series)}
                    className="block max-w-full text-left"
                  >
                    <span className="block truncate text-sm font-black text-charcoal dark:text-white">
                      {series.title}
                    </span>
                  </button>
                  <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                    {next.episode === 1 && next.season > 1 && (
                      <span className="mr-1.5 rounded-md bg-forest/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime">
                        {t('upNext.newSeason')}
                      </span>
                    )}
                    {t('upNext.episodeLine', { season: next.season, episode: next.episode })}
                    {episode?.runtime ? ` · ${episode.runtime} min` : ''}
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500">
                    {lastOfSeason
                      ? t('upNext.lastOne')
                      : remaining.minutes > 0
                        ? t('upNext.left', {
                            count: remaining.count,
                            duration: formatDuration(remaining.minutes),
                          })
                        : t('upNext.leftCount', { count: remaining.count })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => markWatched(item)}
                      aria-label={t('upNext.markWatched', {
                        season: next.season,
                        episode: next.episode,
                      })}
                      className="flex items-center gap-1.5 rounded-xl bg-forest px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-transform active:scale-95"
                    >
                      <Check size={13} strokeWidth={3} />
                      {t('upNext.watched')}
                    </button>
                    {item.netflixUrl && (
                      <a
                        href={item.netflixUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => haptics.medium()}
                        className="flex items-center gap-1.5 rounded-xl bg-[#E50914] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-transform active:scale-95"
                      >
                        <Play size={12} fill="currentColor" />
                        Netflix
                      </a>
                    )}
                    {item.resuming && (
                      <button
                        onClick={() => {
                          haptics.soft();
                          setRecapFor(item);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500 transition-transform active:scale-95 dark:border-white/10 dark:text-stone-300"
                      >
                        <History size={12} strokeWidth={2.5} />
                        {t('upNext.previously')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > VISIBLE_AVAILABLE && (
        <button
          onClick={() => setExpanded((open) => !open)}
          className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500"
        >
          {expanded
            ? t('upNext.less')
            : t('upNext.more', { count: available.length - VISIBLE_AVAILABLE })}
        </button>
      )}

      {upcoming.length > 0 && (
        <div>
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
            {t('upNext.soon')}
          </p>
          <ul className="space-y-1">
            {upcoming.map((item) => (
              <li key={item.series.id}>
                <button
                  onClick={() => onOpenSeries(item.series)}
                  className="flex w-full items-center gap-2 py-1.5 text-left text-[11px] text-stone-500 dark:text-stone-400"
                >
                  <CalendarClock size={13} className="shrink-0 text-stone-400" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold text-charcoal dark:text-white">
                      {item.series.title}
                    </span>
                    {' · '}
                    {t('upNext.soonLine', {
                      season: item.next.season,
                      episode: item.next.episode,
                      date: new Date(`${item.episode!.airDate}T12:00:00`).toLocaleDateString(
                        locale,
                        {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        }
                      ),
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recapFor && (
        <SeriesRecap
          series={recapFor.series}
          seasons={recapFor.seasons}
          onClose={() => setRecapFor(null)}
        />
      )}
    </section>
  );
};

export default UpNext;
