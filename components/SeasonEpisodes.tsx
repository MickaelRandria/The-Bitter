import React, { useEffect, useState } from 'react';
import { Check, Eye, Star } from 'lucide-react';
import { Movie, TvEpisodeEntry, TvProgress } from '../types';
import { getSeasonEpisodes, TvEpisode } from '../services/tv';
import { episodeKey, localDate, updateEpisode } from '../utils/tvProgress';
import { seasonScores } from '../utils/rating';
import { RatingProfileId } from '../config/ratingProfiles';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import EpisodeRatingSheet from './EpisodeRatingSheet';

interface Props {
  series: Movie;
  season: number;
  /** La ligne-saison notée, si elle existe : elle porte le verdict global. */
  seasonMovie?: Movie;
  onUpdate: (progress: TvProgress) => void;
  onRateSeason: () => void;
}

/** Une note sur dix, dans la pastille sombre de l'application. */
const Score: React.FC<{ label: string; value: number | null; hint?: string; onClick?: () => void; cta?: string }> = ({
  label,
  value,
  hint,
  onClick,
  cta,
}) => {
  const body = (
    <>
      <span className="block text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-zinc-500">
        {label}
      </span>
      {value != null ? (
        <>
          <span className="mt-0.5 block text-xl font-semibold leading-tight tabular-nums text-charcoal dark:text-zinc-100">
            {value.toFixed(1)}
            <span className="text-[11px] font-medium text-stone-400 dark:text-zinc-500">/10</span>
          </span>
          {hint && (
            <span className="block text-[10px] font-medium text-stone-400 dark:text-zinc-500">{hint}</span>
          )}
        </>
      ) : (
        <span className="mt-1 block text-[11px] font-semibold leading-tight text-forest dark:text-bitter-lime">
          {cta}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex-1 min-w-0 text-left py-1 active:scale-95 transition-transform">
      {body}
    </button>
  ) : (
    <div className="flex-1 min-w-0">{body}</div>
  );
};

/**
 * Les épisodes d'une saison : cocher, noter, se souvenir.
 *
 * LES TITRES ET LES IMAGES SONT MASQUÉS PAR DÉFAUT
 * Le titre d'un épisode non vu est un spoiler, et son image en est un autre —
 * souvent le plan le plus marquant de l'épisode, choisi pour ça. Les deux ne se
 * révèlent donc qu'une fois l'épisode vu, ou sur demande explicite. Le numéro,
 * lui, reste toujours lisible : il ne raconte rien.
 */
const SeasonEpisodes: React.FC<Props> = ({ series, season, seasonMovie, onUpdate, onRateSeason }) => {
  const { t, language } = useLanguage();
  const [episodes, setEpisodes] = useState<TvEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<TvEpisode | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getSeasonEpisodes(series.tmdbId!, season, language === 'fr' ? 'fr-FR' : 'en-US')
      .then((data) => {
        if (active) setEpisodes(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [series.tmdbId, season, language, retry]);

  const progress = series.tvProgress;
  const entries: TvEpisodeEntry[] = Object.values(progress?.episodes ?? {});
  const scores = seasonScores(seasonMovie, entries, season);

  /* Le mode et le profil du dernier épisode noté de la saison : le suivant les
     reprend, pour qu'un choix fait une fois ne se refasse pas vingt fois. */
  const lastRated = entries
    .filter((e) => e.seasonNumber === season && e.ratingMode)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const saveEpisode = (entry: TvEpisodeEntry) => {
    // Avant de défaire une saison cochée en bloc, on matérialise les autres
    // épisodes : sans quoi décocher le troisième effacerait aussi les deux
    // premiers. Leur date reste inconnue — une coche de saison n'invente pas un
    // historique de visionnage.
    const normalized = progress?.seasonsWatched?.includes(season)
      ? {
          ...progress,
          episodes: {
            ...Object.fromEntries(
              episodes.map((e) => [
                episodeKey(season, e.episodeNumber),
                {
                  seasonNumber: season,
                  episodeNumber: e.episodeNumber,
                  watched: true,
                  runtime: e.runtime,
                  updatedAt: progress.updatedAt,
                },
              ])
            ),
            ...progress.episodes,
          },
        }
      : progress;
    onUpdate(updateEpisode(normalized, entry));
  };

  const entryFor = (episode: TvEpisode): TvEpisodeEntry =>
    progress?.episodes?.[episodeKey(season, episode.episodeNumber)] ?? {
      seasonNumber: season,
      episodeNumber: episode.episodeNumber,
      watched: progress?.seasonsWatched?.includes(season) ?? false,
      runtime: episode.runtime,
      updatedAt: 0,
    };

  if (loading)
    return (
      <p role="status" className="py-4 text-[11px] text-stone-400">
        {t('tv.loading')}
      </p>
    );

  if (error)
    return (
      <div className="py-3 text-[11px] text-stone-500">
        <p>{t('tv.loadError')}</p>
        <button className="py-3 underline font-bold" onClick={() => setRetry((n) => n + 1)}>
          {t('tv.retry')}
        </button>
      </div>
    );

  return (
    <div className="mt-3 border-t border-stone-200 dark:border-white/10 pt-3">
      {/* Les deux notes de la saison, côte à côte : ce qu'ont valu les épisodes,
          et ce qu'il en reste. L'écart entre les deux est ce qu'on vient lire. */}
      <div className="-mx-3 mb-3 flex items-start gap-3 rounded-2xl border border-stone-200/80 bg-white px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <Score
          label={t('tv.episodesAverageLabel')}
          value={scores.episodes?.average ?? null}
          hint={
            scores.episodes
              ? t('tv.ratedCount', { count: scores.episodes.count, total: episodes.length })
              : undefined
          }
          cta={t('tv.noEpisodeRated')}
        />
        <div className="w-px self-stretch bg-stone-200/80 dark:bg-white/[0.06]" />
        <Score
          label={t('tv.seasonGlobalLabel')}
          value={scores.global}
          onClick={onRateSeason}
          cta={t('series.rateSeason')}
        />
      </div>

      {!episodes.length && <p className="text-[11px] text-stone-400">{t('tv.noEpisodes')}</p>}

      {/* La liste reprend la largeur mangée par la carte de saison : sur un
          téléphone, ces 24 pixels sont la différence entre un titre lisible et
          un titre coupé au troisième mot. */}
      <ul className="-mx-3 space-y-3">
        {episodes.map((episode) => {
          const entry = entryFor(episode);
          const visible = entry.watched || revealed.includes(episode.id);
          const rated = entry.rating != null;
          return (
            <li
              key={episode.id}
              className="rounded-2xl border border-stone-200/80 bg-white p-3 transition-colors dark:border-white/[0.06] dark:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="relative aspect-video w-[88px] shrink-0 overflow-hidden rounded-lg bg-stone-200 sm:w-[112px] dark:bg-white/5">
                  {episode.still ? (
                    <img
                      src={resizeTmdbImage(episode.still, 'w342')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`h-full w-full object-cover transition-all duration-300 ${
                        visible ? '' : 'scale-110 blur-md'
                      }`}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-base font-semibold tabular-nums text-stone-300 dark:text-zinc-700">
                      {episode.episodeNumber}
                    </div>
                  )}

                  {/* La note de tout le monde, posée sur l'image. La sienne vit à
                      droite, avec les gestes : les deux ne se confondent pas. */}
                  {episode.voteAverage != null && visible && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-200 backdrop-blur-md">
                      {episode.voteAverage.toFixed(1)}
                    </span>
                  )}

                  {!visible && (
                    <button
                      onClick={() => setRevealed((prev) => [...prev, episode.id])}
                      aria-label={t('tv.revealTitle')}
                      className="absolute inset-0 grid place-items-center bg-black/30 text-white transition-transform active:scale-95"
                    >
                      <Eye size={16} />
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                    {t('tv.episode', { number: episode.episodeNumber })}
                    {episode.runtime ? ` • ${episode.runtime} min` : ''}
                  </p>
                  <p
                    className={`text-sm font-semibold leading-snug text-charcoal line-clamp-2 dark:text-zinc-100 ${
                      visible ? '' : 'select-none blur-[5px]'
                    }`}
                    aria-hidden={!visible}
                  >
                    {episode.name}
                  </p>
                  {/* Le résumé d'un épisode non vu est le pire des spoilers : il
                      ne s'affiche qu'une fois l'épisode découvert. */}
                  {visible && episode.overview && (
                    <p className="mt-0.5 hidden text-xs leading-snug text-stone-500 line-clamp-1 sm:block dark:text-zinc-400">
                      {episode.overview}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Sa note : un badge quand elle existe, une étoile éteinte
                      sinon. Le même bouton dans les deux cas — noter et corriger
                      sont le même geste, pas deux commandes à distinguer. */}
                  <button
                    aria-label={t('tv.rateEpisode', { number: episode.episodeNumber })}
                    onClick={() => {
                      haptics.soft();
                      setEditing(episode);
                    }}
                    className={`flex items-center gap-1 rounded-md transition-colors active:scale-95 ${
                      rated
                        ? 'bg-forest/10 px-2 py-1 text-xs font-semibold text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
                        : 'p-1.5 text-stone-300 hover:text-stone-500 dark:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    <Star size={rated ? 12 : 17} strokeWidth={rated ? 3 : 2} />
                    {rated && <span className="tabular-nums">{entry.rating!.toFixed(1)}</span>}
                  </button>

                  <button
                    aria-label={t(entry.watched ? 'tv.markUnseen' : 'tv.markSeen', {
                      episode: episode.episodeNumber,
                    })}
                    aria-pressed={entry.watched}
                    onClick={() => {
                      haptics.soft();
                      saveEpisode({
                        ...entry,
                        runtime: episode.runtime,
                        watched: !entry.watched,
                        watchedAt: entry.watched ? undefined : localDate(),
                        updatedAt: Date.now(),
                      });
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all active:scale-90 ${
                      entry.watched
                        ? 'border-forest/30 bg-forest/15 text-forest dark:border-bitter-lime/30 dark:bg-bitter-lime/15 dark:text-bitter-lime'
                        : 'border-stone-300 text-transparent hover:border-stone-400 hover:text-stone-400 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-500'
                    }`}
                  >
                    <Check size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {entry.review && visible && (
                <p className="mt-2.5 border-t border-stone-100 pt-2.5 text-xs italic leading-snug text-stone-500 dark:border-white/[0.06] dark:text-zinc-400">
                  «&nbsp;{entry.review}&nbsp;»
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <EpisodeRatingSheet
          series={series}
          episode={editing}
          entry={entryFor(editing)}
          seasonMode={lastRated?.ratingMode}
          seasonProfileId={lastRated?.adaptiveRating?.profile.id as RatingProfileId | undefined}
          onSave={saveEpisode}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default SeasonEpisodes;
