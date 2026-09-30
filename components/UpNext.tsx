import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, History, Play, Star, Users } from 'lucide-react';
import { Movie, TvProgress } from '../types';
import { getSeriesDetails, TmdbSeasonSummary } from '../services/tmdb';
import { getSeasonEpisodes, getWatchOffers, TvEpisode } from '../services/tv';
import { getNetflixUrl } from '../services/streamingLinks';
import { comparePositions, getFriendsSeriesProgress } from '../services/seriesFriends';
import {
  daysUntil,
  EpisodePosition,
  FOLLOWED_STATES,
  formatDuration,
  furthestPosition,
  nextEpisode,
  RailStep,
  remainingInSeason,
  seasonRail,
} from '../utils/upNext';
import { markEpisodeWatched } from '../utils/episodeCompanion';
import { CompanionPhase, EpisodeSession } from '../utils/episodeSession';
import { useEpisodeSession } from '../utils/useEpisodeSession';
import { groupWatchOffers, hasNetflix } from '../utils/watchOffers';
import { hasVerdict } from '../utils/rating';
import { seasonsOf } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import SeasonRail from './SeasonRail';
import SeriesRecap from './SeriesRecap';
import SeriesBookmarkSheet from './SeriesBookmarkSheet';

interface Props {
  /** Toutes les œuvres du profil : les séries suivies et leurs saisons notées en sont tirées. */
  movies: Movie[];
  onUpdateProgress: (series: Movie, progress: TvProgress) => void;
  onOpenSeries: (series: Movie) => void;
  onRateSeason: (series: Movie, season: TmdbSeasonSummary) => void;
  /** Ouvre le mode épisode : avant de lancer, ou au retour pour cocher. */
  onOpenCompanion: (series: Movie, phase: CompanionPhase) => void;
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
  /** L'image large de la série. Jamais celle de l'épisode à venir : elle en dévoilerait trop. */
  backdrop?: string;
  rail: RailStep[];
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
const VISIBLE_UPCOMING = 8;
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
  const furthest = furthestPosition(series.tvProgress, details.seasons);
  const started = furthest != null && (furthest.episode > 0 || furthest.season > 1);

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
    backdrop: details.backdropUrl,
    rail: seasonRail(episodes, next.episode, today),
  };
}

/** Des proches plus loin ou au même épisode, comptés sans jamais dire où. */
function useFriendsPlace(item: UpNextItem) {
  const [place, setPlace] = useState<{ ahead: number; same: number }>({ ahead: 0, same: 0 });
  const { series, seasons } = item;
  useEffect(() => {
    if (series.tmdbId == null) return;
    let active = true;
    const me = furthestPosition(series.tvProgress, seasons);
    getFriendsSeriesProgress(series.tmdbId, seasons).then((friends) => {
      if (!active) return;
      const placed = friends.filter((f) => f.position);
      setPlace({
        ahead: placed.filter((f) => !me || comparePositions(f.position!, me) > 0).length,
        same: me ? placed.filter((f) => comparePositions(f.position!, me) === 0).length : 0,
      });
    });
    return () => {
      active = false;
    };
  }, [series.tmdbId, series.tvProgress, seasons]);
  return place;
}

interface CardProps {
  item: UpNextItem;
  single: boolean;
  session: EpisodeSession | null;
  onOpen: () => void;
  onLaunch: () => void;
  onFinish: () => void;
  onMark: () => void;
  onRecap: () => void;
}

/**
 * Une série à reprendre, en grand : son image, sa place dans la saison, et le
 * geste qui lance l'épisode. Le reste de la carte ouvre la fiche.
 */
const UpNextCard: React.FC<CardProps> = ({ item, single, session, onOpen, onLaunch, onFinish, onMark, onRecap }) => {
  const { t } = useLanguage();
  const friends = useFriendsPlace(item);
  const { series, next, episode, remaining } = item;
  const watchingNow =
    session?.seriesId === series.id && session.season === next.season && session.episode === next.episode;
  const image = item.backdrop ?? series.posterUrl;

  return (
    <li
      className={`relative h-[252px] shrink-0 snap-start overflow-hidden rounded-[1.75rem] bg-[#141414] shadow-lg shadow-black/10 ${
        single ? 'w-full' : 'w-[86%] max-w-[340px]'
      }`}
    >
      {image && (
        <img
          src={resizeTmdbImage(image, 'w780')}
          alt=""
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${item.backdrop ? '' : 'object-[center_20%]'}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
      <button onClick={onOpen} aria-label={t('upNext.open', { title: series.title })} className="absolute inset-0" />

      <div className="pointer-events-none relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {watchingNow && (
              <span className="flex items-center gap-1.5 rounded-full bg-bitter-lime px-2 py-1 text-[9px] font-black uppercase tracking-wider text-black">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />
                {t('upNext.watchingNow')}
              </span>
            )}
            {next.episode === 1 && next.season > 1 && (
              <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur">
                {t('upNext.newSeason')}
              </span>
            )}
            {(friends.ahead > 0 || friends.same > 0) && (
              <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[9px] font-bold text-white/80 backdrop-blur">
                <Users size={10} strokeWidth={2.5} />
                {friends.ahead > 0
                  ? t('upNext.friendsAhead', { count: friends.ahead })
                  : t('upNext.friendsSame', { count: friends.same })}
              </span>
            )}
          </div>
          {item.netflixUrl && (
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E50914] text-[13px] font-black text-white"
            >
              N
            </span>
          )}
        </div>

        <div>
          <p className="text-[22px] font-black leading-none tracking-tight text-white line-clamp-1">
            {series.title}
          </p>
          <p className="mt-1.5 text-[11px] font-bold text-white/70">
            {t('upNext.episodeLine', { season: next.season, episode: next.episode })}
            {episode?.runtime ? ` · ${episode.runtime} min` : ''}
          </p>
          <SeasonRail steps={item.rail} className="mt-2.5" />
          <p className="mt-1.5 text-[10px] text-white/50">
            {remaining.count <= 1
              ? t('upNext.lastOne')
              : remaining.minutes > 0
                ? t('upNext.left', {
                    count: remaining.count,
                    duration: formatDuration(remaining.minutes),
                  })
                : t('upNext.leftCount', { count: remaining.count })}
          </p>

          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <button
              onClick={watchingNow ? onFinish : onLaunch}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-bitter-lime px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-black transition-transform active:scale-95"
            >
              {watchingNow ? <Check size={13} strokeWidth={3} /> : <Play size={12} fill="currentColor" />}
              <span className="truncate">{watchingNow ? t('upNext.finished') : t('upNext.launch')}</span>
            </button>
            <button
              onClick={onMark}
              aria-label={t('upNext.markWatched', { season: next.season, episode: next.episode })}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform active:scale-90"
            >
              <Check size={15} strokeWidth={3} />
            </button>
            {item.resuming && (
              <button
                onClick={onRecap}
                aria-label={t('upNext.previously')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform active:scale-90"
              >
                <History size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

/** Une affiche cliquable, pour dire où on en est dans une série pas encore suivie. */
const PosterButton: React.FC<{ series: Movie; onClick: () => void; className?: string }> = ({
  series,
  onClick,
  className = '',
}) => (
  <button
    onClick={() => {
      haptics.soft();
      onClick();
    }}
    aria-label={series.title}
    className={`block aspect-[2/3] overflow-hidden rounded-xl bg-stone-200 transition-transform active:scale-95 dark:bg-[#252525] ${className}`}
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
);

/**
 * « À suivre » : le prochain épisode de chaque série en cours, en grand, prêt à
 * être lancé.
 *
 * C'est ce qui remplace une synchronisation avec les plateformes, impossible
 * sans stocker les identifiants de chacun : on lance l'épisode d'ici, et au
 * retour l'app demande comment c'était (voir EpisodeCompanion). La coche rapide
 * reste pour qui a regardé sans passer par l'app. Le titre de l'épisode n'est
 * jamais affiché : il n'est pas encore vu, c'est donc un spoiler.
 */
const UpNext: React.FC<Props> = ({ movies, onUpdateProgress, onOpenSeries, onRateSeason, onOpenCompanion }) => {
  const { t, language } = useLanguage();
  const session = useEpisodeSession();
  const [items, setItems] = useState<UpNextItem[] | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [recapFor, setRecapFor] = useState<UpNextItem | null>(null);
  const [bookmarkFor, setBookmarkFor] = useState<Movie | null>(null);
  /** Les séries du dernier chargement, pour distinguer un ajout d'un épisode coché. */
  const loadedIds = useRef('');

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

  // Les séries de la collection dont on ne connaît pas la place : de quoi alimenter « Tu en es où ? ».
  const untracked = useMemo(
    () =>
      movies
        .filter(
          (m) =>
            m.mediaType === 'tv' &&
            m.seasonNumber == null &&
            m.tmdbId != null &&
            m.tvProgress?.state !== 'dropped' &&
            !(m.tvProgress && FOLLOWED_STATES.includes(m.tvProgress.state))
        )
        // Les séries déjà vues d'abord : ce sont les plus susceptibles d'être en cours.
        .sort((a, b) => Number(b.status === 'watched') - Number(a.status === 'watched'))
        .slice(0, 8),
    [movies]
  );

  useEffect(() => {
    if (followed.length === 0) {
      setItems([]);
      loadedIds.current = '';
      return;
    }
    // Une série de plus ou de moins : repartir du squelette. Sans ça, le
    // carrousel resterait calé sur la carte qu'il montrait pendant le chargement.
    // Un simple épisode coché, lui, recharge sans rien faire clignoter.
    const ids = followed.map((s) => s.id).join('|');
    if (ids !== loadedIds.current) setItems(null);
    loadedIds.current = ids;
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

  const bookmarkSheet = bookmarkFor && (
    <SeriesBookmarkSheet
      series={bookmarkFor}
      onSave={(progress) => onUpdateProgress(bookmarkFor, progress)}
      onClose={() => setBookmarkFor(null)}
      onOpenSeries={() => onOpenSeries(bookmarkFor)}
    />
  );

  if (followed.length === 0) {
    // Des séries dans la collection, aucune suivie : sans point de départ, « À
    // suivre » n'a rien à proposer. Relevé le 30 septembre 2026 : 14 séries sur 15
    // en base n'avaient aucune progression. On invite donc à dire où on en est,
    // en deux gestes et sans passer par la fiche.
    if (untracked.length === 0) return null;
    return (
      <section aria-labelledby="up-next-title" className="space-y-3">
        <p
          id="up-next-title"
          className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500"
        >
          {t('upNext.title')}
        </p>
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#141414] p-4 text-white">
          {untracked[0].posterUrl && (
            <img
              src={resizeTmdbImage(untracked[0].posterUrl, 'w342')}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
            />
          )}
          <div className="relative">
            <p className="text-lg font-black leading-tight tracking-tight">{t('upNext.inviteTitle')}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/60">{t('upNext.inviteBody')}</p>
            <div className="-mx-4 mt-4 flex gap-2.5 overflow-x-auto no-scrollbar px-4 pb-1">
              {untracked.map((series) => (
                <div key={series.id} className="w-[72px] shrink-0">
                  <PosterButton series={series} onClick={() => setBookmarkFor(series)} />
                  <span className="mt-1 block truncate text-[10px] font-bold text-white/60">
                    {series.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {bookmarkSheet}
      </section>
    );
  }

  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const today = todayInParis();
  const available = (items ?? []).filter((item) => item.available);
  const upcoming = (items ?? [])
    .filter((item) => !item.available)
    .sort((a, b) => (a.episode?.airDate ?? '').localeCompare(b.episode?.airDate ?? ''))
    .slice(0, VISIBLE_UPCOMING);

  if (items && available.length === 0 && upcoming.length === 0 && !lastAction && untracked.length === 0) {
    return null;
  }

  const markWatched = (item: UpNextItem) => {
    haptics.medium();
    const { series, next, seasons } = item;
    const before = series.tvProgress;
    const progress = markEpisodeWatched(before, next, seasons, {
      ended: item.ended,
      runtime: item.episode?.runtime,
    });

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
  const single = available.length === 1 && untracked.length === 0;

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
        <div className="-mx-6 flex gap-3 overflow-hidden px-6">
          <div className="h-[252px] w-[86%] max-w-[340px] shrink-0 animate-pulse rounded-[1.75rem] bg-stone-100 dark:bg-white/5" />
          <div className="h-[252px] w-[86%] max-w-[340px] shrink-0 animate-pulse rounded-[1.75rem] bg-stone-100 dark:bg-white/5" />
        </div>
      ) : (
        (available.length > 0 || untracked.length > 0) && (
          <ul className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
            {available.map((item) => (
              <UpNextCard
                key={item.series.id}
                item={item}
                single={single}
                session={session}
                onOpen={() => onOpenSeries(item.series)}
                onLaunch={() => {
                  haptics.medium();
                  onOpenCompanion(item.series, 'before');
                }}
                onFinish={() => {
                  haptics.soft();
                  onOpenCompanion(item.series, 'after');
                }}
                onMark={() => markWatched(item)}
                onRecap={() => {
                  haptics.soft();
                  setRecapFor(item);
                }}
              />
            ))}
            {untracked.length > 0 && (
              <li
                className={`flex h-[252px] shrink-0 snap-start flex-col rounded-[1.75rem] border border-dashed border-stone-300 p-3.5 dark:border-white/15 ${
                  available.length === 0 ? 'w-full' : 'w-[168px]'
                }`}
              >
                <p className="text-[13px] font-black leading-tight text-charcoal dark:text-white">
                  {t('upNext.anotherTitle')}
                </p>
                <p className="mt-0.5 text-[10px] text-stone-400 dark:text-stone-500">
                  {t('upNext.anotherHint')}
                </p>
                <div
                  className={`mt-auto grid gap-1.5 ${available.length === 0 ? 'grid-cols-4' : 'grid-cols-2'}`}
                >
                  {untracked.slice(0, 4).map((series) => (
                    <PosterButton key={series.id} series={series} onClick={() => setBookmarkFor(series)} />
                  ))}
                </div>
              </li>
            )}
          </ul>
        )
      )}

      {upcoming.length > 0 && (
        <div className="pt-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
              {t('upNext.soon')}
            </p>
            <p className="flex items-center gap-1 text-[9px] font-bold text-stone-400 dark:text-stone-500">
              <Bell size={10} strokeWidth={2.5} />
              {t('upNext.soonAlert')}
            </p>
          </div>
          <ul className="-mx-6 flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
            {upcoming.map((item) => {
              const airDate = item.episode!.airDate!;
              const days = daysUntil(airDate, today);
              return (
                <li key={item.series.id} className="w-[84px] shrink-0">
                  <button onClick={() => onOpenSeries(item.series)} className="block w-full text-left">
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-stone-200 dark:bg-[#252525]">
                      {item.series.posterUrl && (
                        <img
                          src={resizeTmdbImage(item.series.posterUrl, 'w185')}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-bitter-lime px-1.5 py-0.5 text-[9px] font-black uppercase text-black shadow">
                        {days <= 1 ? t('upNext.tomorrow') : t('upNext.inDays', { count: days })}
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate text-[10px] font-bold text-charcoal dark:text-white">
                      {item.series.title}
                    </span>
                    <span className="block truncate text-[9px] text-stone-400 dark:text-stone-500">
                      {t('upNext.episodeLine', { season: item.next.season, episode: item.next.episode })}
                      {' · '}
                      {new Date(`${airDate}T12:00:00`).toLocaleDateString(locale, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
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
      {bookmarkSheet}
    </section>
  );
};

export default UpNext;
