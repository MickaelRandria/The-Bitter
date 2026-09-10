import React, { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { AdaptiveRatingCriterion, Movie, TvEpisodeEntry } from '../types';
import { TvEpisode } from '../services/tv';
import {
  ADAPTIVE_RATING_VERSION,
  RatingProfileId,
  detectRatingProfile,
  getRatingProfile,
} from '../config/ratingProfiles';
import { buildCriteriaForProfile, calculateWeightedRating } from '../utils/rating';
import { localDate } from '../utils/tvProgress';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { CriterionRow, LiveRating, ProfilePicker, RatingModeSwitch } from './RatingCriteriaGrid';
import { resizeTmdbImage } from '../utils/tmdbImage';

interface Props {
  series: Movie;
  episode: TvEpisode;
  entry: TvEpisodeEntry;
  /** Le mode et le profil retenus pour le dernier épisode noté de la saison. */
  seasonMode?: 'bitter' | 'bitter_plus';
  seasonProfileId?: RatingProfileId;
  onSave: (entry: TvEpisodeEntry) => void;
  onClose: () => void;
}

/**
 * Noter un épisode, avec la grille des films.
 *
 * POURQUOI LE PROFIL N'EST PAS CELUI DE LA SÉRIE
 * `detectRatingProfile(genre, 'tv')` renvoie le profil « Série », dont le
 * critère spécifique est le rythme — « la saison utilise bien ses épisodes, ou
 * tu as senti du remplissage ? ». C'est une question sur la saison, pas sur
 * l'épisode : on ne peut pas y répondre devant un épisode seul. L'épisode est
 * donc jugé sur le profil de son genre, et le rythme reste au verdict de
 * saison, là où il veut dire quelque chose. Le sélecteur Bitter+ permet quand
 * même de choisir « Série » à la main.
 *
 * POURQUOI BITTER PAR DÉFAUT
 * Noter un épisode est un geste répété — dix, vingt fois par saison. Imposer
 * cinq curseurs pondérés à chaque fois transformerait le suivi en corvée. Le
 * premier épisode ouvre donc la grille simple, et les suivants héritent du mode
 * choisi pour le précédent : basculer une fois en Bitter+ suffit à y rester.
 */
const EpisodeRatingSheet: React.FC<Props> = ({
  series,
  episode,
  entry,
  seasonMode,
  seasonProfileId,
  onSave,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, episode.name);

  const previous = entry.adaptiveRating;
  const [useBitterPlus, setUseBitterPlus] = useState(
    (entry.ratingMode ?? seasonMode ?? 'bitter') === 'bitter_plus'
  );

  const detected = useMemo<RatingProfileId>(() => detectRatingProfile(series.genre), [series.genre]);
  const [profileId, setProfileId] = useState<RatingProfileId>(
    (previous?.profile.id as RatingProfileId) ?? seasonProfileId ?? detected
  );

  const [values, setValues] = useState<Record<string, number>>(() =>
    previous ? Object.fromEntries(previous.criteria.map((c) => [c.key, c.value])) : {}
  );
  const [review, setReview] = useState(entry.review ?? '');
  const [date, setDate] = useState(entry.watchedAt ?? '');

  const criteria: AdaptiveRatingCriterion[] = buildCriteriaForProfile(
    useBitterPlus ? profileId : 'standard',
    values
  );
  const simpleAverage =
    criteria.length === 0
      ? 0
      : Math.round((criteria.reduce((sum, c) => sum + c.value, 0) / criteria.length) * 10) / 10;
  const rating = useBitterPlus ? calculateWeightedRating(criteria) : simpleAverage;

  /* Un critère jamais touché vaut 5 par défaut — une note que personne n'a
     posée. Tant qu'il en reste un, enregistrer inventerait un avis. Une note
     déjà enregistrée échappe à cette attente : elle est complète par
     construction, et changer de profil ne doit pas la reprendre à zéro. */
  const complete = !!previous || criteria.every((c) => values[c.key] != null);

  const setValue = (key: string, value: number) =>
    setValues((prev) => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }));

  const commit = (patch: Partial<TvEpisodeEntry>) => {
    haptics.medium();
    onSave({ ...entry, ...patch, updatedAt: Date.now() });
    onClose();
  };

  const handleSave = () => {
    if (!complete) return;
    const profile = getRatingProfile(useBitterPlus ? profileId : 'standard');
    commit({
      rating,
      ratingMode: useBitterPlus ? 'bitter_plus' : 'bitter',
      adaptiveRating: {
        profile: { id: profile.id, label: profile.label, version: ADAPTIVE_RATING_VERSION },
        /* Les explications de chaque critère ne sont pas enregistrées. Elles
           pèsent 1,8 ko par grille et se retrouvent telles quelles dans le
           profil : les garder ferait grossir `tv_progress` d'un kilo-octet par
           épisode noté, soit une centaine pour une série suivie à fond — tout
           ça pour un texte que l'affichage relit dans `ratingProfiles` de toute
           façon. La note, elle, est entièrement conservée. */
        criteria: criteria.map(({ description: _unused, ...rest }) => rest),
        weightedRating: rating,
        legacyRating: simpleAverage,
      },
      review: review.trim() || undefined,
      // La date ne se pose que sur un épisode vu : en dater un non vu dirait
      // qu'on l'a regardé.
      watchedAt: entry.watched ? date || undefined : undefined,
    });
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.25s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative shrink-0">
          <div className="h-28 bg-stone-200 dark:bg-[#161616] overflow-hidden">
            {episode.still && (
              <img
                src={resizeTmdbImage(episode.still, 'w500')}
                alt=""
                className="w-full h-full object-cover opacity-70"
                loading="lazy"
              />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] to-transparent" />
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
              {t('tv.episodeLabel', {
                season: episode.seasonNumber,
                episode: episode.episodeNumber,
              })}
            </p>
            <p className="text-lg font-black text-charcoal dark:text-white leading-tight line-clamp-2">
              {episode.name}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 space-y-5">
          <RatingModeSwitch
            useBitterPlus={useBitterPlus}
            onChange={(plus) => {
              haptics.soft();
              setUseBitterPlus(plus);
            }}
            bitterLabel={t('addMovie.bitterMode')}
            bitterPlusLabel={t('addMovie.bitterPlusMode')}
            hint={useBitterPlus ? t('addMovie.bitterPlusModeHint') : t('addMovie.bitterModeHint')}
          />

          {useBitterPlus && (
            <ProfilePicker
              profileId={profileId}
              onChange={setProfileId}
              label={t('tv.episodeProfile')}
            />
          )}

          <div className="space-y-4">
            {criteria.map((criterion) => (
              <CriterionRow
                key={criterion.key}
                criterion={criterion}
                onChange={setValue}
                showWeight={useBitterPlus}
                showDescription={useBitterPlus}
              />
            ))}
          </div>

          <LiveRating rating={rating} label={t('tv.episodeFinalRating')} />

          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
            {t('tv.personalReview')}
            <textarea
              maxLength={2000}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
              className="mt-2 block w-full rounded-2xl p-3 text-sm font-medium normal-case tracking-normal bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 text-charcoal dark:text-white outline-none"
            />
          </label>

          {entry.watched && (
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
              {t('tv.watchedDate')}
              <input
                type="date"
                max={localDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 block w-full rounded-2xl p-3 text-sm font-bold normal-case tracking-normal bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 text-charcoal dark:text-white outline-none"
              />
            </label>
          )}
        </div>

        <div className="shrink-0 border-t border-sand dark:border-white/10 px-6 py-4 space-y-2">
          <button
            onClick={handleSave}
            disabled={!complete}
            className="w-full h-14 rounded-2xl bg-forest text-white text-[11px] font-black uppercase tracking-[0.14em] active:scale-[0.99] transition-transform disabled:opacity-40"
          >
            {complete ? t('tv.save') : t('tv.rateAllCriteria')}
          </button>
          {entry.rating != null && (
            <button
              onClick={() =>
                commit({ rating: undefined, adaptiveRating: undefined, ratingMode: undefined })
              }
              className="w-full h-11 rounded-2xl flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400"
            >
              <Trash2 size={13} /> {t('tv.removeRating')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EpisodeRatingSheet;
