import React, { useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { AdaptiveRatingCriterion, Movie, TvEpisodeEntry, TvRatingMode } from '../types';
import { TvEpisode } from '../services/tv';
import {
  ADAPTIVE_RATING_VERSION,
  DEFAULT_CUSTOM_WEIGHTS,
  RatingProfileId,
  detectRatingProfile,
  getRatingProfile,
} from '../config/ratingProfiles';
import { buildCriteriaForProfile, calculateWeightedRating } from '../utils/rating';
import { localDate } from '../utils/tvProgress';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { AdaptiveRatingSection, BitterRatingSection, ProfilePicker } from './RatingGrid';

interface Props {
  series: Movie;
  episode: TvEpisode;
  entry: TvEpisodeEntry;
  /** Le mode et le profil retenus pour le dernier épisode noté de la saison. */
  seasonMode?: TvRatingMode;
  seasonProfileId?: RatingProfileId;
  onSave: (entry: TvEpisodeEntry) => void;
  onClose: () => void;
}

const MODES: TvRatingMode[] = ['global', 'bitter', 'bitter_plus'];

/**
 * Noter un épisode, avec la grille des films.
 *
 * C'EST LA MÊME GRILLE, PAS UNE VARIANTE
 * `BitterRatingSection` et `AdaptiveRatingSection` sont les composants que rend
 * l'écran d'ajout d'un film. Un épisode et un film se notent donc au même
 * curseur, au même pas, avec les mêmes explications. Une grille jumelle aurait
 * fini par diverger, et la même note n'aurait plus voulu dire la même chose
 * selon l'écran par lequel on est passé.
 *
 * CE QU'ON N'Y TROUVE PAS
 * Ni contexte de visionnage, ni empreintes, ni facteur de distraction, ni
 * amorces d'avis. Ces questions se posent une fois par film ; les poser vingt
 * fois par saison transformerait le suivi en formulaire. Un épisode, c'est une
 * note et un commentaire.
 *
 * TROIS MODES, ET LE PLUS COURT EN PREMIER
 * « Note globale » pose un seul chiffre et s'arrête là — c'est le geste de
 * quelqu'un qui enchaîne les épisodes et veut juste dire « celui-là était bien ».
 * Bitter détaille en quatre critères, Bitter+ les pondère. Le mode et le profil
 * du dernier épisode noté sont repris pour le suivant : un choix fait une fois
 * ne se refait pas vingt fois.
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
  const [mode, setMode] = useState<TvRatingMode>(entry.ratingMode ?? seasonMode ?? 'global');

  /* Le profil « Série » a pour critère spécifique le rythme — « la saison
     utilise bien ses épisodes ? ». C'est une question sur la saison, à laquelle
     on ne peut pas répondre devant un épisode seul. L'épisode est donc jugé sur
     le profil de son genre ; le sélecteur permet de choisir « Série » à la main. */
  const detected = useMemo<RatingProfileId>(() => detectRatingProfile(series.genre), [series.genre]);
  const [profileId, setProfileId] = useState<RatingProfileId>(
    (previous?.profile.id as RatingProfileId) ?? seasonProfileId ?? detected
  );
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  const [values, setValues] = useState<Record<string, number>>(() =>
    previous ? Object.fromEntries(previous.criteria.map((c) => [c.key, c.value])) : {}
  );
  const [globalRating, setGlobalRating] = useState<number>(entry.rating ?? 5);
  /* Le point de départ et les poids d'un profil perso sont de vrais réglages de
     la grille Bitter+ : les lui passer en dur les aurait rendus inertes ici,
     alors qu'ils répondent sur l'écran des films. */
  const [quickRating, setQuickRating] = useState<number | null>(null);
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(() => {
    if (previous?.profile.id === 'custom') {
      return { ...DEFAULT_CUSTOM_WEIGHTS, ...Object.fromEntries(previous.criteria.map((c) => [c.key, c.weight])) };
    }
    return { ...DEFAULT_CUSTOM_WEIGHTS };
  });
  const [review, setReview] = useState(entry.review ?? '');
  const [date, setDate] = useState(entry.watchedAt ?? '');

  const criteria: AdaptiveRatingCriterion[] = buildCriteriaForProfile(
    mode === 'bitter_plus' ? profileId : 'standard',
    values,
    customWeights
  );
  const simpleAverage =
    criteria.length === 0
      ? 0
      : Math.round((criteria.reduce((sum, c) => sum + c.value, 0) / criteria.length) * 10) / 10;
  const rating =
    mode === 'global' ? globalRating : mode === 'bitter_plus' ? calculateWeightedRating(criteria) : simpleAverage;

  /* Un critère jamais touché vaut 5 par défaut — une note que personne n'a
     posée. Tant qu'il en reste un, enregistrer inventerait un avis. Une note
     déjà enregistrée échappe à cette attente : elle est complète par
     construction, et changer de profil ne doit pas la reprendre à zéro. La note
     globale, elle, est toujours complète : son curseur est la note. */
  const complete = mode === 'global' || !!previous || criteria.every((c) => values[c.key] != null);

  const setValue = (key: string, value: number) => {
    setQuickRating(null);
    setValues((prev) => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }));
  };

  const commit = (patch: Partial<TvEpisodeEntry>) => {
    haptics.medium();
    onSave({ ...entry, ...patch, updatedAt: Date.now() });
    onClose();
  };

  const handleSave = () => {
    if (!complete) return;
    const profile = getRatingProfile(mode === 'bitter_plus' ? profileId : 'standard');
    commit({
      rating,
      ratingMode: mode,
      /* Une note globale n'a pas de grille : rien à conserver, et fabriquer
         quatre critères tous égaux à partir d'elle affirmerait un détail que
         personne n'a posé. */
      adaptiveRating:
        mode === 'global'
          ? undefined
          : {
              profile: { id: profile.id, label: profile.label, version: ADAPTIVE_RATING_VERSION },
              /* Les explications de chaque critère ne sont pas enregistrées.
                 Elles pèsent près de deux kilo-octets par grille et se
                 retrouvent telles quelles dans le profil : les garder ferait
                 grossir `tv_progress` d'un kilo-octet par épisode noté. */
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
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="relative shrink-0">
          <div className="h-32 bg-stone-200 dark:bg-[#161616] overflow-hidden">
            {episode.still && (
              <img
                src={resizeTmdbImage(episode.still, 'w500')}
                alt=""
                className="w-full h-full object-cover opacity-70"
                loading="lazy"
              />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] via-cream/40 dark:via-[#0c0c0c]/40 to-transparent" />
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              {t('tv.episodeLabel', {
                season: episode.seasonNumber,
                episode: episode.episodeNumber,
              })}
            </p>
            <p className="text-xl font-black text-charcoal dark:text-white leading-tight line-clamp-2 tracking-tight">
              {episode.name}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-6 space-y-7">
          <div>
            <div
              role="tablist"
              aria-label={t('tv.ratingMode')}
              className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl border border-stone-200/50 dark:border-white/5"
            >
              {MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={mode === option}
                  onClick={() => {
                    haptics.soft();
                    setMode(option);
                  }}
                  className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    mode === option
                      ? 'bg-charcoal dark:bg-[#202020] text-white shadow-md'
                      : 'text-stone-400 dark:text-stone-600'
                  }`}
                >
                  {t(`tv.mode.${option}`)}
                </button>
              ))}
            </div>
            <p className="mt-3 ml-1 text-[11px] font-medium leading-snug text-stone-500 dark:text-stone-400">
              {t(`tv.modeHint.${mode}`)}
            </p>
          </div>

          {mode === 'global' ? (
            <div className="rounded-[2rem] bg-charcoal dark:bg-[#1a1a1a] p-6 text-white shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                  {t('tv.episodeFinalRating')}
                </p>
                <span className="text-5xl font-black tracking-tighter text-bitter-lime tabular-nums shrink-0">
                  {globalRating.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={globalRating}
                aria-label={t('tv.episodeFinalRating')}
                onChange={(e) => setGlobalRating(Number(e.target.value))}
                className="mt-6 w-full accent-bitter-lime"
              />
              <div className="mt-1 flex justify-between text-[9px] font-bold text-stone-500">
                <span>0</span>
                <span>10</span>
              </div>
            </div>
          ) : mode === 'bitter_plus' ? (
            <AdaptiveRatingSection
              profileId={profileId}
              profileLabel={getRatingProfile(profileId).label}
              criteria={criteria}
              weightedRating={rating}
              customWeights={customWeights}
              quickRating={quickRating}
              ratedKeys={values}
              isReady={complete}
              onQuickRating={(value) => {
                setQuickRating(value);
                setValues(Object.fromEntries(criteria.map((c) => [c.key, value])));
              }}
              onChange={setValue}
              onChangeCustomWeight={(key, weight) => {
                haptics.soft();
                setCustomWeights((prev) => ({ ...prev, [key]: weight }));
              }}
              onOpenProfilePicker={() => {
                haptics.soft();
                setShowProfilePicker(true);
              }}
            />
          ) : (
            <BitterRatingSection
              criteria={criteria}
              finalRating={rating}
              onChange={setValue}
              onSwitchToBitterPlus={() => {
                haptics.soft();
                setMode('bitter_plus');
              }}
            />
          )}

          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1">
            {t('tv.personalReview')}
            <textarea
              maxLength={2000}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
              placeholder={t('tv.reviewPlaceholder')}
              className="mt-2 block w-full rounded-2xl p-4 text-sm font-medium normal-case tracking-normal bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 text-charcoal dark:text-white outline-none shadow-sm placeholder:text-stone-300 dark:placeholder:text-stone-700"
            />
          </label>

          {entry.watched && (
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1">
              {t('tv.watchedDate')}
              <input
                type="date"
                max={localDate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 block w-full rounded-2xl p-4 text-sm font-bold normal-case tracking-normal bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 text-charcoal dark:text-white outline-none shadow-sm"
              />
            </label>
          )}
        </div>

        <div className="shrink-0 border-t border-sand dark:border-white/10 px-6 py-4 space-y-2 bg-cream dark:bg-[#0c0c0c]">
          <button
            onClick={handleSave}
            disabled={!complete}
            className="w-full h-14 rounded-2xl bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal text-[11px] font-black uppercase tracking-[0.14em] active:scale-[0.99] transition-transform disabled:opacity-40"
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

      {showProfilePicker && (
        <ProfilePicker
          currentProfileId={profileId}
          onSelect={(id) => {
            haptics.soft();
            setProfileId(id);
            setShowProfilePicker(false);
          }}
          onClose={() => setShowProfilePicker(false)}
        />
      )}
    </div>
  );
};

export default EpisodeRatingSheet;
