import React, { useMemo, useState } from 'react';
import {
  RotateCw,
  X,
  Star,
  TrendingUp,
  Target,
  TrendingDown,
  ThumbsDown,
  Search,
  Sparkles,
  Plus,
  Minus,
} from 'lucide-react';
import { AdaptiveRatingCriterion, Movie, MovieWatch, RewatchSentiment, WeightLabel } from '../types';
import {
  ADAPTIVE_RATING_VERSION,
  PROFILE_OPTIONS,
  RatingProfileId,
  getRatingProfile,
} from '../config/ratingProfiles';
import { buildCriteriaForProfile, calculateWeightedRating, detectRatingProfile } from '../utils/rating';
import { haptics } from '../utils/haptics';

const SENTIMENTS: {
  id: RewatchSentiment;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: 'better', label: "C'était mieux", icon: TrendingUp },
  { id: 'same', label: 'Toujours aussi bien', icon: Target },
  { id: 'worse', label: "C'était moyen", icon: TrendingDown },
  { id: 'disappointed', label: 'Décevant', icon: ThumbsDown },
  { id: 'discovered', label: "J'ai découvert des détails", icon: Search },
  { id: 'nostalgic', label: 'Nostalgie', icon: Sparkles },
];

const SENTIMENT_BASE =
  'bg-stone-50 dark:bg-[#202020] text-stone-600 dark:text-stone-400 border-stone-200 dark:border-white/10';
const SENTIMENT_ACTIVE =
  'bg-forest/10 dark:bg-bitter-lime/10 text-forest dark:text-bitter-lime border-forest dark:border-bitter-lime';

interface RewatchModalProps {
  movie: Movie;
  onClose: () => void;
  onSave: (watch: MovieWatch) => void;
}

const WeightBadge: React.FC<{ label: WeightLabel }> = ({ label }) => {
  if (label === 'Standard') return null;
  const base = 'text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full';
  const styles =
    label === 'Essentiel'
      ? 'bg-bitter-lime text-charcoal'
      : label === 'Important'
        ? 'bg-forest/15 text-forest dark:bg-lime-500/20 dark:text-lime-300'
        : 'bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-400';
  return <span className={`${base} ${styles}`}>{label}</span>;
};

const RewatchModal: React.FC<RewatchModalProps> = ({ movie, onClose, onSave }) => {
  const lastWatch = movie.watches?.[movie.watches.length - 1];
  const lastDate = lastWatch?.watched_at
    ? new Date(lastWatch.watched_at)
    : movie.dateWatched
      ? new Date(movie.dateWatched)
      : new Date(movie.dateAdded);

  // Profile resolution: prefer last watch's adaptive profile, then movie's, then detected from genre
  const previousAdaptive = lastWatch?.adaptiveRating ?? movie.adaptiveRating;
  const previousProfileId = previousAdaptive?.profile.id;
  const previousIsLegacy = !previousAdaptive || previousProfileId === 'standard_legacy';
  const detectedProfile = useMemo(() => detectRatingProfile(movie.genre), [movie.genre]);
  const initialProfile: RatingProfileId =
    !previousIsLegacy && previousProfileId
      ? (previousProfileId as RatingProfileId)
      : detectedProfile;

  const [profileId, setProfileId] = useState<RatingProfileId>(initialProfile);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [keepLegacy, setKeepLegacy] = useState(false);

  const seedValues = useMemo<Record<string, number>>(() => {
    if (previousAdaptive) {
      const map: Record<string, number> = {};
      for (const c of previousAdaptive.criteria) map[c.key] = c.value;
      return map;
    }
    const r = lastWatch?.ratings ?? movie.ratings;
    return {
      scenario: r.story,
      image: r.visuals,
      interpretation: r.acting,
      sound: r.sound,
    };
  }, [previousAdaptive, lastWatch, movie.ratings]);

  const [criteriaValues, setCriteriaValues] = useState<Record<string, number>>(seedValues);

  // Legacy mode: stay on the old 4 ratings sliders
  const [legacyRatings, setLegacyRatings] = useState(() => ({ ...(lastWatch?.ratings ?? movie.ratings) }));
  const lastRatings = lastWatch?.ratings ?? movie.ratings;
  const lastAvg =
    (lastRatings.story + lastRatings.visuals + lastRatings.acting + lastRatings.sound) / 4;

  const [sentiment, setSentiment] = useState<RewatchSentiment | null>(null);
  const [review, setReview] = useState('');

  const useLegacyMode = previousIsLegacy && keepLegacy;

  const criteria: AdaptiveRatingCriterion[] = useLegacyMode
    ? []
    : buildCriteriaForProfile(profileId, criteriaValues);
  const weightedRating = useLegacyMode
    ? (legacyRatings.story + legacyRatings.visuals + legacyRatings.acting + legacyRatings.sound) / 4
    : calculateWeightedRating(criteria);
  const globalDiff = weightedRating - lastAvg;
  const watchNumber = (movie.watch_count ?? 1) + 1;

  const setCriterionValue = (key: string, value: number) => {
    setCriteriaValues((prev) => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }));
  };

  const handleSave = () => {
    if (!sentiment) return;
    let ratings;
    let adaptiveRating;
    if (useLegacyMode) {
      ratings = {
        story: Math.round(legacyRatings.story * 2) / 2,
        visuals: Math.round(legacyRatings.visuals * 2) / 2,
        acting: Math.round(legacyRatings.acting * 2) / 2,
        sound: Math.round(legacyRatings.sound * 2) / 2,
      };
    } else {
      const profile = getRatingProfile(profileId);
      adaptiveRating = {
        profile: { id: profile.id, label: profile.label, version: ADAPTIVE_RATING_VERSION },
        criteria,
        weightedRating,
      };
      ratings = {
        story: weightedRating,
        visuals: weightedRating,
        acting: weightedRating,
        sound: weightedRating,
      };
    }
    const watch: MovieWatch = {
      id: crypto.randomUUID(),
      watch_number: watchNumber,
      watched_at: new Date().toISOString(),
      ratings,
      review: review.trim() || undefined,
      sentiment,
      adaptiveRating,
    };
    onSave(watch);
  };

  const baseCriteria = criteria.filter((c) => c.group === 'base');
  const specificCriteria = criteria.filter((c) => c.group === 'specific');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[92vh] overflow-y-auto border border-sand dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-[#1a1a1a] border-b border-sand dark:border-white/10 p-6 flex items-center justify-between z-10 rounded-t-[2.5rem] sm:rounded-t-[2.5rem]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest/10 dark:bg-bitter-lime/10 rounded-full flex items-center justify-center">
              <RotateCw size={18} strokeWidth={2.5} className="text-forest dark:text-bitter-lime" />
            </div>
            <div>
              <h2 className="font-black text-base text-charcoal dark:text-white leading-tight">
                Rewatch #{watchNumber - 1}
              </h2>
              <p className="text-[11px] text-stone-400 dark:text-stone-600 font-medium truncate max-w-[180px]">
                {movie.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center hover:bg-stone-200 dark:hover:bg-[#303030] transition-all active:scale-90"
          >
            <X size={18} strokeWidth={2.5} className="text-charcoal dark:text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Dernière vision */}
          <div className="bg-stone-50 dark:bg-[#202020] p-4 rounded-2xl border border-stone-200 dark:border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              Dernière vision
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Star size={14} fill="#D9FF00" className="text-bitter-lime" />
                <span className="font-black text-base text-charcoal dark:text-white">
                  {(previousAdaptive?.weightedRating ?? lastAvg).toFixed(1)}
                </span>
              </div>
              <span className="text-[11px] text-stone-400 dark:text-stone-600 font-medium">
                {lastDate.toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Legacy bridge */}
          {previousIsLegacy && (
            <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-2">
                Ce film a été noté avec l’ancien système
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-200/80 leading-snug mb-3">
                Tu peux conserver l’ancien système ou passer au nouveau profil.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    setKeepLegacy(true);
                  }}
                  className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-all border ${
                    useLegacyMode
                      ? 'bg-charcoal text-white border-charcoal dark:bg-bitter-lime dark:text-charcoal dark:border-bitter-lime'
                      : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border-stone-200 dark:border-white/10'
                  }`}
                >
                  Garder l’ancien
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    setKeepLegacy(false);
                  }}
                  className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-all border ${
                    !useLegacyMode
                      ? 'bg-charcoal text-white border-charcoal dark:bg-bitter-lime dark:text-charcoal dark:border-bitter-lime'
                      : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border-stone-200 dark:border-white/10'
                  }`}
                >
                  Nouveau profil
                </button>
              </div>
            </div>
          )}

          {/* Sentiments */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white mb-3">
              Par rapport à la dernière fois ?
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {SENTIMENTS.map((s) => {
                const Icon = s.icon;
                const isSelected = sentiment === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSentiment(s.id)}
                    className={`p-3 rounded-2xl border-2 transition-all text-left active:scale-[0.98] hover:scale-[1.01] ${
                      isSelected ? SENTIMENT_ACTIVE : SENTIMENT_BASE
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} strokeWidth={2.5} />
                      <span className="font-bold text-[11px] leading-tight">{s.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notation */}
          {useLegacyMode ? (
            <LegacyRatings
              values={legacyRatings}
              lastRatings={lastRatings}
              onChange={(key, value) =>
                setLegacyRatings((prev) => ({ ...prev, [key]: value }))
              }
            />
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                    Profil utilisé
                  </p>
                  <p className="font-black text-base text-charcoal dark:text-white mt-1 truncate">
                    {getRatingProfile(profileId).label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    setShowProfilePicker(true);
                  }}
                  className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white border border-stone-200 dark:border-white/10 active:scale-95 transition-all"
                >
                  Changer
                </button>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-3">
                  Critères principaux
                </p>
                <div className="space-y-3">
                  {baseCriteria.map((c) => (
                    <RewatchCriterionRow
                      key={c.key}
                      criterion={c}
                      previousValue={previousAdaptive?.criteria.find((x) => x.key === c.key)?.value}
                      onChange={setCriterionValue}
                    />
                  ))}
                </div>
              </div>

              {specificCriteria.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-3">
                    Critère spécifique
                  </p>
                  <div className="space-y-3">
                    {specificCriteria.map((c) => (
                      <RewatchCriterionRow
                        key={c.key}
                        criterion={c}
                        previousValue={previousAdaptive?.criteria.find((x) => x.key === c.key)?.value}
                        onChange={setCriterionValue}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Note finale */}
          <div className="p-4 bg-forest/10 dark:bg-bitter-lime/10 rounded-2xl border border-forest/20 dark:border-bitter-lime/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-bitter-lime">
                Note finale
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-forest dark:text-bitter-lime">
                  {weightedRating.toFixed(1)}
                </span>
                {Math.abs(globalDiff) >= 0.05 && (
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      globalDiff > 0
                        ? 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                        : 'bg-stone-200 dark:bg-white/10 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {globalDiff > 0 ? '+' : ''}
                    {globalDiff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Review optionnelle */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Qu'as-tu remarqué de nouveau ?"
              className="w-full p-3 bg-stone-50 dark:bg-[#202020] border border-stone-200 dark:border-white/10 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-forest dark:focus:ring-bitter-lime transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700"
              rows={3}
            />
          </div>

          {/* Bouton sauvegarder */}
          <button
            onClick={handleSave}
            disabled={!sentiment}
            className="w-full py-4 bg-forest hover:bg-forest/90 dark:hover:bg-bitter-lime dark:hover:text-charcoal text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Enregistrer ce rewatch
          </button>
        </div>
      </div>

      {showProfilePicker && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          onClick={() => setShowProfilePicker(false)}
        >
          <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-[#0c0c0c] w-full sm:max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[80vh] overflow-y-auto border-t dark:border-white/10 sm:border dark:border-white/10"
          >
            <div className="p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
              <h3 className="font-black text-lg text-charcoal dark:text-white tracking-tight">
                Choisir un profil
              </h3>
              <button
                onClick={() => setShowProfilePicker(false)}
                className="w-9 h-9 rounded-full bg-stone-100 dark:bg-[#161616] flex items-center justify-center active:scale-90 transition-all"
              >
                <X size={16} className="text-charcoal dark:text-white" />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {PROFILE_OPTIONS.map((opt) => {
                const selected = opt.id === profileId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      haptics.soft();
                      setProfileId(opt.id);
                      setShowProfilePicker(false);
                    }}
                    className={`w-full text-left px-4 py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${
                      selected
                        ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal'
                        : 'bg-stone-50 dark:bg-[#1a1a1a] text-charcoal dark:text-white border border-stone-100 dark:border-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RewatchCriterionRow: React.FC<{
  criterion: AdaptiveRatingCriterion;
  previousValue?: number;
  onChange: (key: string, value: number) => void;
}> = ({ criterion, previousValue, onChange }) => {
  const { key, label, value, weightLabel } = criterion;
  const diff = previousValue != null ? value - previousValue : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 truncate">
            {label}
          </span>
          <WeightBadge label={weightLabel} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onChange(key, Math.max(0, value - 0.5))}
            className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-[#202020] flex items-center justify-center active:scale-90 transition-all"
          >
            <Minus size={11} strokeWidth={3} className="text-charcoal dark:text-white" />
          </button>
          <span className="text-[11px] font-black text-charcoal dark:text-white w-7 text-center">
            {value.toFixed(1)}
          </span>
          <button
            type="button"
            onClick={() => onChange(key, Math.min(10, value + 0.5))}
            className="w-7 h-7 rounded-lg bg-bitter-lime flex items-center justify-center active:scale-90 transition-all"
          >
            <Plus size={11} strokeWidth={3} className="text-charcoal" />
          </button>
          {Math.abs(diff) >= 0.05 && (
            <span
              className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                diff > 0
                  ? 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                  : 'bg-stone-200 dark:bg-white/10 text-stone-500 dark:text-stone-400'
              }`}
            >
              {diff > 0 ? '+' : ''}
              {diff.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => onChange(key, parseFloat(e.target.value))}
        className="w-full accent-forest dark:accent-bitter-lime"
      />
    </div>
  );
};

const LEGACY_CRITERIA = [
  { key: 'story' as const, label: 'Écriture' },
  { key: 'visuals' as const, label: 'Esthétique' },
  { key: 'acting' as const, label: 'Interprétation' },
  { key: 'sound' as const, label: 'Univers Sonore' },
];

const LegacyRatings: React.FC<{
  values: { story: number; visuals: number; acting: number; sound: number };
  lastRatings: { story: number; visuals: number; acting: number; sound: number };
  onChange: (key: 'story' | 'visuals' | 'acting' | 'sound', value: number) => void;
}> = ({ values, lastRatings, onChange }) => (
  <div>
    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white mb-3">
      Nouvelle notation (système classique)
    </h3>
    <div className="space-y-4">
      {LEGACY_CRITERIA.map(({ key, label }) => {
        const diff = values[key] - lastRatings[key];
        return (
          <div key={key}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                {label}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-charcoal dark:text-white">
                  {values[key].toFixed(1)}
                </span>
                {Math.abs(diff) >= 0.05 && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      diff > 0
                        ? 'bg-forest/15 text-forest dark:bg-bitter-lime/15 dark:text-bitter-lime'
                        : 'bg-stone-200 dark:bg-white/10 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {diff > 0 ? '+' : ''}
                    {diff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={values[key]}
              onChange={(e) => onChange(key, parseFloat(e.target.value))}
              className="w-full accent-forest dark:accent-bitter-lime"
            />
          </div>
        );
      })}
    </div>
  </div>
);

export default RewatchModal;
