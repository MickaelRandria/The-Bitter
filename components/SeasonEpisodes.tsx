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
      <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
        {label}
      </span>
      {value != null ? (
        <>
          <span className="block text-xl font-black text-charcoal dark:text-white tabular-nums leading-tight">
            {value.toFixed(1)}
            <span className="text-[11px] text-stone-400">/10</span>
          </span>
          {hint && <span className="block text-[9px] font-bold text-stone-400">{hint}</span>}
        </>
      ) : (
        <span className="block text-[11px] font-black text-forest dark:text-bitter-lime leading-tight mt-1">
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
      <div className="flex items-start gap-3 rounded-2xl bg-white dark:bg-[#161616] border border-sand dark:border-white/10 px-3 py-2.5 mb-3">
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
        <div className="w-px self-stretch bg-sand dark:bg-white/10" />
        <Score
          label={t('tv.seasonGlobalLabel')}
          value={scores.global}
          onClick={onRateSeason}
          cta={t('series.rateSeason')}
        />
      </div>

      {!episodes.length && <p className="text-[11px] text-stone-400">{t('tv.noEpisodes')}</p>}

      <ul className="space-y-2.5">
        {episodes.map((episode) => {
          const entry = entryFor(episode);
          const visible = entry.watched || revealed.includes(episode.id);
          const rated = entry.rating != null;
          return (
            <li
              key={episode.id}
              /* Trois états se distinguent d'un coup d'œil : rien, vu, noté.
                 Le liseré vert dit « tu as posé un avis » sans rien lire. */
              className={`rounded-2xl border overflow-hidden transition-colors ${
                rated
                  ? 'border-forest/40 dark:border-bitter-lime/30 bg-white dark:bg-[#181818]'
                  : 'border-stone-200 dark:border-white/10 bg-white dark:bg-[#161616]'
              }`}
            >
              <div className="flex gap-3 p-2.5">
                <div className="relative w-[5.5rem] aspect-video shrink-0 rounded-xl overflow-hidden bg-stone-200 dark:bg-[#252525]">
                  {episode.still ? (
                    <img
                      src={resizeTmdbImage(episode.still, 'w342')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`w-full h-full object-cover transition-all duration-300 ${
                        visible ? '' : 'blur-md scale-110'
                      }`}
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-stone-300 dark:text-stone-700 text-lg font-black tabular-nums">
                      {episode.episodeNumber}
                    </div>
                  )}

                  {!visible && (
                    <button
                      onClick={() => setRevealed((prev) => [...prev, episode.id])}
                      aria-label={t('tv.revealTitle')}
                      className="absolute inset-0 grid place-items-center bg-black/30 text-white active:scale-95 transition-transform"
                    >
                      <Eye size={16} />
                    </button>
                  )}

                  {/* La note se lit sur l'image : c'est ce qu'on parcourt en
                      remontant une saison déjà vue. */}
                  {rated && (
                    <span className="absolute bottom-1 right-1 rounded-lg bg-charcoal/90 dark:bg-black/80 px-1.5 py-0.5 text-[11px] font-black text-bitter-lime tabular-nums backdrop-blur-sm">
                      {entry.rating!.toFixed(1)}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-400 dark:text-stone-600">
                      {t('tv.episode', { number: episode.episodeNumber })}
                      {episode.runtime ? ` · ${episode.runtime} min` : ''}
                    </p>
                    <p
                      className={`text-[13px] font-bold leading-tight text-charcoal dark:text-white line-clamp-2 ${
                        visible ? '' : 'select-none blur-[5px]'
                      }`}
                      aria-hidden={!visible}
                    >
                      {episode.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
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
                      className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center border transition-all active:scale-90 ${
                        entry.watched
                          ? 'bg-forest border-forest text-white'
                          : 'border-stone-300 dark:border-white/20 text-transparent'
                      }`}
                    >
                      <Check size={14} strokeWidth={3} />
                    </button>

                    {/* Un épisode vu mais pas encore noté est ce qui attend un
                        geste : son bouton est plein. Les autres restent sobres. */}
                    <button
                      aria-label={t('tv.rateEpisode', { number: episode.episodeNumber })}
                      onClick={() => {
                        haptics.soft();
                        setEditing(episode);
                      }}
                      className={`h-9 flex-1 min-w-0 rounded-xl px-3 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                        rated
                          ? 'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white'
                          : entry.watched
                            ? 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal shadow-sm'
                            : 'border border-stone-200 dark:border-white/10 text-stone-400 dark:text-stone-500'
                      }`}
                    >
                      {rated ? (
                        <>
                          <Star size={11} strokeWidth={3} /> {t('tv.editRating')}
                        </>
                      ) : (
                        t('tv.rate')
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {entry.review && visible && (
                <p className="px-3 pb-3 text-[11px] italic leading-snug text-stone-500 dark:text-stone-400">
                  « {entry.review} »
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
