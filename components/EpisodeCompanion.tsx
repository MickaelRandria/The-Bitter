import React, { useEffect, useMemo, useState } from 'react';
import { Check, History, Loader2, Play, Star, Users, X } from 'lucide-react';
import { EpisodeReaction, Movie, TvEpisodeEntry, TvProgress } from '../types';
import { getSeriesDetails, TmdbSeasonSummary, TmdbSeriesDetails } from '../services/tmdb';
import { CastMember, getSeasonCast, getSeasonEpisodes, getWatchOffers, TvEpisode } from '../services/tv';
import { getNetflixUrl } from '../services/streamingLinks';
import { comparePositions, getFriendsSeriesProgress } from '../services/seriesFriends';
import { EpisodePosition, furthestPosition, nextEpisode, seasonRail } from '../utils/upNext';
import { markEpisodeWatched } from '../utils/episodeCompanion';
import { REACTION_EMOJI, REACTIONS, seasonMoments } from '../utils/seriesInsights';
import {
  CompanionPhase,
  readEpisodeSession,
  sessionMoment,
  writeEpisodeSession,
} from '../utils/episodeSession';
import { useEpisodeSession } from '../utils/useEpisodeSession';
import { episodeKey } from '../utils/tvProgress';
import { groupWatchOffers, hasNetflix } from '../utils/watchOffers';
import { hasVerdict } from '../utils/rating';
import { seasonsOf } from '../utils/workKey';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { RatingProfileId } from '../config/ratingProfiles';
import SeasonRail from './SeasonRail';
import SeriesRecap from './SeriesRecap';
import EpisodeRatingSheet from './EpisodeRatingSheet';

interface Props {
  /** La ligne-série, tenue à jour par l'app : ce qu'on coche ici y revient. */
  series: Movie;
  allMovies: Movie[];
  phase: CompanionPhase;
  /**
   * Ouvert depuis une carte « À suivre » par une transition : l'image de la
   * carte devient l'affiche de la séance. Pas d'animation d'entrée en plus.
   */
  morph?: boolean;
  /** L'image de la carte, pour que l'affiche soit la même dès la première image. */
  initialImage?: string;
  onClose: () => void;
  onUpdateProgress: (progress: TvProgress) => void;
  onRateSeason: (season: TmdbSeasonSummary) => void;
}

type View = 'before' | 'watching' | 'after' | 'done';

interface Done {
  seen: EpisodePosition;
  before: TvProgress | undefined;
  /** La saison que cet épisode vient de terminer, si elle attend encore un verdict. */
  finishedSeason?: TmdbSeasonSummary;
  following: EpisodePosition | null;
  /** Les moments forts de la saison, quand cet épisode la termine. */
  moments: ReturnType<typeof seasonMoments>;
}

const todayInParis = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const QUICK_RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Le mode épisode : l'app qui accompagne un épisode, du canapé au verdict.
 *
 * AVANT, le récap de ce qu'on a vu, sans rien sur la suite. PENDANT, le
 * lancement : Netflix quand on sait y ouvrir la série, sinon un simple « je
 * lance ». L'app retient alors l'épisode et l'heure (voir
 * utils/episodeSession.ts). APRÈS, au retour dans l'app, elle demande comment
 * c'était : cocher, noter en un geste, enchaîner.
 *
 * Toujours sombre, quel que soit le thème : c'est un écran de salle, posé sur
 * l'image de la série. L'image vient de la série et jamais de l'épisode à
 * venir, dont le plan choisi par TMDB est souvent le moment fort.
 */
const EpisodeCompanion: React.FC<Props> = ({
  series,
  allMovies,
  phase,
  morph = false,
  initialImage,
  onClose,
  onUpdateProgress,
  onRateSeason,
}) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, series.title);
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';

  const session = useEpisodeSession();
  const mine = session?.seriesId === series.id ? session : null;

  const [details, setDetails] = useState<TmdbSeriesDetails | null | undefined>(undefined);
  const [position, setPosition] = useState<EpisodePosition | null | undefined>(undefined);
  const [episodes, setEpisodes] = useState<TvEpisode[]>([]);
  const [netflixUrl, setNetflixUrl] = useState<string | null>(null);
  const [friendsAhead, setFriendsAhead] = useState(0);
  const [view, setView] = useState<View>(() => {
    if (phase === 'after') return 'after';
    if (!mine) return 'before';
    return sessionMoment(mine, Date.now()) === 'ask' ? 'after' : 'watching';
  });
  const [rating, setRating] = useState<number | null>(null);
  const [reactions, setReactions] = useState<EpisodeReaction[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    (series.tmdbId != null ? getSeriesDetails(series.tmdbId) : Promise.resolve(null))
      .catch(() => null)
      .then((value) => active && setDetails(value));
    return () => {
      active = false;
    };
  }, [series.tmdbId]);

  // L'épisode de la séance en cours s'il y en a une, sinon le suivant à voir.
  useEffect(() => {
    if (details === undefined || position !== undefined) return;
    const started = readEpisodeSession();
    setPosition(
      started?.seriesId === series.id
        ? { season: started.season, episode: started.episode }
        : details
          ? nextEpisode(series.tvProgress, details.seasons)
          : null
    );
  }, [details, position, series.id, series.tvProgress]);

  useEffect(() => {
    if (series.tmdbId == null || !position) return;
    let active = true;
    getSeasonEpisodes(series.tmdbId, position.season, locale)
      .catch(() => [] as TvEpisode[])
      .then((list) => active && setEpisodes(list));
    return () => {
      active = false;
    };
  }, [series.tmdbId, position?.season, locale]);

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

  // « Qui est qui ? » : le casting de la saison, seulement pendant l'épisode.
  useEffect(() => {
    if (view !== 'watching' || series.tmdbId == null || !position) return;
    let active = true;
    getSeasonCast(series.tmdbId, position.season, locale)
      .catch(() => [] as CastMember[])
      .then((list) => active && setCast(list));
    return () => {
      active = false;
    };
  }, [view, series.tmdbId, position?.season, locale]);

  // Des proches plus loin : on le dit, sans jamais dire où.
  useEffect(() => {
    if (series.tmdbId == null || !details) return;
    let active = true;
    const me = furthestPosition(series.tvProgress, details.seasons);
    getFriendsSeriesProgress(series.tmdbId, details.seasons).then((friends) => {
      if (!active) return;
      setFriendsAhead(
        friends.filter((f) => f.position && (!me || comparePositions(f.position, me) > 0)).length
      );
    });
    return () => {
      active = false;
    };
  }, [series.tmdbId, details, series.tvProgress]);

  // Pendant l'épisode : l'horloge du « lancé il y a », et la question au retour.
  useEffect(() => {
    if (view !== 'watching') return;
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      const current = readEpisodeSession();
      if (current?.seriesId === series.id && sessionMoment(current, Date.now()) === 'ask') {
        setView('after');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [view, series.id]);

  const today = todayInParis();
  const episode = position ? episodes.find((e) => e.episodeNumber === position.episode) : undefined;
  const runtime = episode?.runtime ?? (details?.episodeRuntime || undefined);
  const rail = useMemo(
    () => (position ? seasonRail(episodes, position.episode, today) : []),
    [episodes, position, today]
  );
  const ended = details?.productionStatus === 'Ended' || details?.productionStatus === 'Canceled';
  const me = details ? furthestPosition(series.tvProgress, details.seasons) : null;
  const started = me != null && (me.episode > 0 || me.season > 1);

  const start = () => {
    if (!position) return;
    haptics.medium();
    writeEpisodeSession({
      seriesId: series.id,
      season: position.season,
      episode: position.episode,
      runtime,
      startedAt: Date.now(),
    });
    setNow(Date.now());
    setView('watching');
  };

  const snooze = () => {
    const current = readEpisodeSession();
    if (current?.seriesId === series.id) writeEpisodeSession({ ...current, promptedAt: Date.now() });
    onClose();
  };

  const forget = () => {
    haptics.soft();
    writeEpisodeSession(null);
  };

  const finish = (extra?: Partial<TvEpisodeEntry>) => {
    if (!position || !details) return;
    const before = series.tvProgress;
    // Sans réaction choisie, on ne touche pas à celles d'un premier visionnage.
    const withReactions = reactions.length ? { ...extra, reactions } : extra;
    const progress = markEpisodeWatched(before, position, details.seasons, {
      ended,
      runtime,
      extra: withReactions,
    });
    writeEpisodeSession(null);
    onUpdateProgress(progress);
    haptics.success();

    const season = details.seasons.find((s) => s.seasonNumber === position.season);
    const seasonDone = season != null && position.episode >= season.episodeCount;
    const alreadyRated = seasonsOf(allMovies, series.tmdbId).some(
      (m) => m.seasonNumber === position.season && hasVerdict(m)
    );
    setDone({
      seen: position,
      before,
      finishedSeason: seasonDone && !alreadyRated ? season : undefined,
      following: nextEpisode(progress, details.seasons),
      moments: seasonDone
        ? seasonMoments(Object.values<TvEpisodeEntry>(progress.episodes ?? {}), position.season)
        : [],
    });
    setView('done');
  };

  const undo = () => {
    if (!done) return;
    haptics.soft();
    onUpdateProgress({ state: 'watching', ...done.before, updatedAt: Date.now() });
    setPosition(done.seen);
    setDone(null);
    setView('after');
  };

  const chain = (following: EpisodePosition) => {
    haptics.soft();
    setPosition(following);
    setRating(null);
    setReactions([]);
    setDone(null);
    setView('before');
  };

  /** L'épisode suivant est-il déjà sorti ? Même saison : sa date ; saison suivante : celle de la saison. */
  const followingAirDate = (following: EpisodePosition): string | undefined =>
    following.season === done?.seen.season
      ? episodes.find((e) => e.episodeNumber === following.episode)?.airDate
      : details?.seasons.find((s) => s.seasonNumber === following.season)?.airDate;

  const lastRated = Object.values<TvEpisodeEntry>(series.tvProgress?.episodes ?? {})
    .filter((e) => position && e.seasonNumber === position.season && e.ratingMode)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const shown = done?.seen ?? position;
  const image = details?.backdropUrl ?? initialImage ?? series.posterUrl;
  const minutes = mine ? Math.max(0, Math.floor((now - mine.startedAt) / 60_000)) : 0;

  const primary =
    'flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime py-4 text-[11px] font-black uppercase tracking-widest text-black transition-transform active:scale-[0.98]';
  const secondary =
    'flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/80 transition-transform active:scale-[0.98]';
  const quiet = 'py-2 text-[10px] font-black uppercase tracking-widest text-white/40';

  const launchButton = netflixUrl ? (
    <a
      href={netflixUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={start}
      className={`${primary} !bg-[#E50914] !text-white`}
    >
      <Play size={14} fill="currentColor" />
      {t('companion.launchNetflix')}
    </a>
  ) : (
    <button onClick={start} className={primary}>
      <Play size={14} fill="currentColor" />
      {t('companion.launch')}
    </button>
  );

  const steps = [
    {
      label: t('companion.before'),
      body: started ? (
        <button
          onClick={() => {
            haptics.soft();
            setRecapOpen(true);
          }}
          className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] px-3.5 py-3 text-left transition-transform active:scale-[0.98]"
        >
          <History size={16} className="shrink-0 text-bitter-lime" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-white">{t('recap.kicker')}</span>
            <span className="block text-[11px] text-white/50">{t('companion.recapHint')}</span>
          </span>
        </button>
      ) : (
        <p className="text-[12px] text-white/50">{t('companion.firstEpisode')}</p>
      ),
    },
    {
      label: t('companion.during'),
      body: (
        <div className="space-y-2">
          {launchButton}
          {!netflixUrl && <p className="text-[11px] text-white/40">{t('companion.launchHint')}</p>}
        </div>
      ),
    },
    {
      label: t('companion.after'),
      body: <p className="text-[12px] text-white/50">{t('companion.afterHint')}</p>,
    },
  ];

  return (
    <div
      {...dialog.props}
      className={`fixed inset-0 z-[290] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm ${
        morph ? '' : 'animate-[fadeIn_0.25s_ease-out]'
      }`}
    >
      <div
        className={`relative flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-[#0a0a0a] text-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-[2.5rem] ${
          morph ? '' : 'animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]'
        }`}
      >
        {/* L'affiche de la séance. */}
        <div className="relative h-[36dvh] min-h-[210px] shrink-0 overflow-hidden">
          {image && (
            <img
              src={resizeTmdbImage(image, 'w780')}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${morph ? '' : 'animate-[fadeIn_0.6s_ease-out]'}`}
              style={morph ? { viewTransitionName: 'episode-hero' } : undefined}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-black/30" />
          <span className="absolute left-5 top-5 rounded-full bg-bitter-lime px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-black">
            {t('companion.kicker')}
          </span>
          <button
            onClick={view === 'after' ? snooze : onClose}
            aria-label={t('common.close')}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-transform active:scale-90"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
            <p className="text-3xl font-black leading-none tracking-tight line-clamp-2">{series.title}</p>
            {shown && (
              <p className="mt-2 text-[12px] font-bold text-white/70">
                {t('companion.episode', { season: shown.season, episode: shown.episode })}
                {runtime && !done ? ` · ${runtime} min` : ''}
              </p>
            )}
            {rail.length > 0 && !done && (
              <>
                <SeasonRail steps={rail} className="mt-3" />
                <p className="sr-only">
                  {t('companion.episodeOf', { episode: position!.episode, total: rail.length })}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {details === undefined || position === undefined ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-white/30" size={22} />
            </div>
          ) : view === 'done' && done ? (
            <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-black">
                  <Check size={20} strokeWidth={3} />
                </span>
                <p className="min-w-0 flex-1 text-lg font-black">
                  {t('companion.seen', { season: done.seen.season, episode: done.seen.episode })}
                </p>
                <button onClick={undo} className={quiet}>
                  {t('upNext.undo')}
                </button>
              </div>

              {done.moments.length > 0 && (
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    {t('companion.moments')}
                  </p>
                  <p className="mt-2 text-[14px] font-bold">
                    {t('companion.mostOf', {
                      emoji: REACTION_EMOJI[done.moments[0].reaction],
                      episode: done.moments[0].episode,
                    })}
                  </p>
                  {done.moments.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {done.moments.slice(1).map((moment) => (
                        <span
                          key={moment.reaction}
                          className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white/80"
                        >
                          {REACTION_EMOJI[moment.reaction]} É{moment.episode}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {done.finishedSeason ? (
                <div className="space-y-3 rounded-2xl bg-white/[0.06] p-4">
                  <p className="text-[14px] font-bold">
                    {t('companion.seasonDone', { season: done.finishedSeason.seasonNumber })}
                  </p>
                  <button
                    onClick={() => {
                      haptics.soft();
                      const season = done.finishedSeason!;
                      onClose();
                      onRateSeason(season);
                    }}
                    className={primary}
                  >
                    <Star size={13} strokeWidth={3} />
                    {t('companion.rateSeason')}
                  </button>
                </div>
              ) : done.following ? (
                (() => {
                  const airDate = followingAirDate(done.following);
                  if (airDate && airDate <= today) {
                    return (
                      <button onClick={() => chain(done.following!)} className={primary}>
                        <Play size={14} fill="currentColor" />
                        {done.following.season !== done.seen.season
                          ? t('companion.chainSeason', { season: done.following.season })
                          : t('companion.chain', { episode: done.following.episode })}
                      </button>
                    );
                  }
                  return (
                    <p className="text-[12px] text-white/60">
                      {airDate
                        ? t('companion.nextOn', {
                            episode: done.following.episode,
                            date: new Date(`${airDate}T12:00:00`).toLocaleDateString(locale, {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                            }),
                          })
                        : t('companion.upToDate')}
                    </p>
                  );
                })()
              ) : (
                <p className="text-[12px] text-white/60">{t('companion.upToDate')}</p>
              )}

              <button onClick={onClose} className={secondary}>
                {t('companion.close')}
              </button>
            </div>
          ) : !position ? (
            <div className="space-y-5">
              <p className="text-[13px] text-white/60">{t('companion.upToDate')}</p>
              <button onClick={onClose} className={secondary}>
                {t('companion.close')}
              </button>
            </div>
          ) : view === 'after' ? (
            <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
              <div>
                <p className="text-2xl font-black tracking-tight">{t('companion.askTitle')}</p>
                <p className="mt-1 text-[12px] text-white/50">{t('companion.askHint')}</p>
              </div>

              <div>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                  {t('companion.reactionsTitle')}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {REACTIONS.map((reaction) => {
                    const on = reactions.includes(reaction);
                    return (
                      <button
                        key={reaction}
                        onClick={() => {
                          haptics.soft();
                          setReactions((list) =>
                            on ? list.filter((r) => r !== reaction) : [...list, reaction]
                          );
                        }}
                        aria-pressed={on}
                        aria-label={t(`reaction.${reaction}`)}
                        className={`flex h-14 items-center justify-center rounded-2xl text-[26px] transition-all active:scale-90 ${
                          on ? 'scale-105 bg-bitter-lime/20 ring-2 ring-bitter-lime' : 'bg-white/[0.06] grayscale-[0.4]'
                        }`}
                      >
                        {REACTION_EMOJI[reaction]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {QUICK_RATINGS.map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      haptics.soft();
                      setRating(value === rating ? null : value);
                    }}
                    aria-pressed={value === rating}
                    aria-label={t('companion.rateAria', { rating: value })}
                    className={`h-12 rounded-xl text-[15px] font-black tabular-nums transition-all active:scale-90 ${
                      rating != null && value <= rating
                        ? value === rating
                          ? 'bg-bitter-lime text-black'
                          : 'bg-bitter-lime/20 text-bitter-lime'
                        : 'bg-white/[0.06] text-white/70'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              {episode && (
                <button
                  onClick={() => {
                    haptics.soft();
                    setGridOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50"
                >
                  <Star size={12} strokeWidth={2.5} />
                  {t('companion.fullGrid')}
                </button>
              )}

              <div className="space-y-2">
                <button
                  onClick={() =>
                    finish(rating != null ? { rating, ratingMode: 'global', adaptiveRating: undefined } : undefined)
                  }
                  className={primary}
                >
                  <Check size={15} strokeWidth={3} />
                  {rating != null
                    ? t('companion.markWatchedRated', { rating })
                    : t('companion.markWatched')}
                </button>
                <div className="flex items-center justify-between">
                  <button onClick={snooze} className={quiet}>
                    {t('companion.notFinished')}
                  </button>
                  <button
                    onClick={() => {
                      forget();
                      onClose();
                    }}
                    className={quiet}
                  >
                    {t('companion.didntWatch')}
                  </button>
                </div>
              </div>
            </div>
          ) : view === 'watching' ? (
            <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bitter-lime opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-bitter-lime" />
                </span>
                <div>
                  <p className="text-2xl font-black tracking-tight">{t('companion.watchingTitle')}</p>
                  <p className="text-[11px] font-bold text-white/50">
                    {minutes < 1
                      ? t('companion.watchingJustNow')
                      : t('companion.watchingSince', { minutes })}
                  </p>
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-white/50">{t('companion.watchingHint')}</p>
              {cast.length > 0 && position && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    {t('companion.whoIsWho')}
                  </p>
                  <ul className="-mx-6 mt-3 flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
                    {cast.map((member) => (
                      <li key={member.id} className="w-[76px] shrink-0">
                        <span className="block aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.06]">
                          {member.photo ? (
                            <img
                              src={resizeTmdbImage(member.photo, 'w185')}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-xl font-black text-white/30">
                              {member.character.charAt(0)}
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 block text-[11px] font-black leading-tight text-white line-clamp-2">
                          {member.character}
                        </span>
                        <span className="block truncate text-[10px] text-white/40">{member.actor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    haptics.soft();
                    setView('after');
                  }}
                  className={primary}
                >
                  <Check size={15} strokeWidth={3} />
                  {t('upNext.finished')}
                </button>
                {netflixUrl && (
                  <a
                    href={netflixUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => haptics.medium()}
                    className={secondary}
                  >
                    <Play size={12} fill="currentColor" />
                    {t('companion.reopenNetflix')}
                  </a>
                )}
                <button
                  onClick={() => {
                    forget();
                    setView('before');
                  }}
                  className={`${quiet} w-full text-center`}
                >
                  {t('companion.stop')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-[fadeIn_0.3s_ease-out]">
              <ol className="space-y-4">
                {steps.map((step, index) => (
                  <li key={step.label} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-[10px] font-black text-white/70">
                        {index + 1}
                      </span>
                      {index < steps.length - 1 && <span className="mt-1.5 w-px flex-1 bg-white/10" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                        {step.label}
                      </p>
                      {step.body}
                    </div>
                  </li>
                ))}
              </ol>

              {friendsAhead > 0 && (
                <p className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-[11px] text-white/50">
                  <Users size={14} className="shrink-0 text-white/40" />
                  {t('companion.friendsAhead', { count: friendsAhead })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {recapOpen && details && (
        <SeriesRecap series={series} seasons={details.seasons} onClose={() => setRecapOpen(false)} />
      )}

      {gridOpen && episode && position && (
        <EpisodeRatingSheet
          series={series}
          episode={episode}
          entry={{
            ...series.tvProgress?.episodes?.[episodeKey(position.season, position.episode)],
            seasonNumber: position.season,
            episodeNumber: position.episode,
            watched: true,
            runtime: episode.runtime,
            updatedAt: 0,
          }}
          seasonMode={lastRated?.ratingMode}
          seasonProfileId={lastRated?.adaptiveRating?.profile.id as RatingProfileId | undefined}
          onSave={(entry) => finish(entry)}
          onClose={() => setGridOpen(false)}
        />
      )}
    </div>
  );
};

export default EpisodeCompanion;
