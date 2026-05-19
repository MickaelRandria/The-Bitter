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
  CUSTOM_WEIGHT_LEVELS,
  DEFAULT_CUSTOM_WEIGHTS,
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

// Mapping weight → pips: Essentiel ●●●, Important ●●○, Standard ●○○, Secondaire ○○○
const weightToPipCount = (weight: number): number =>
  weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;

const PIP_A11Y_LABEL: Record<WeightLabel, string> = {
  Essentiel: 'Influence forte dans la note finale',
  Important: 'Influence moyenne dans la note finale',
  Standard: 'Influence normale dans la note finale',
  Secondaire: 'Influence légère dans la note finale',
};

const WeightPips: React.FC<{ weight: number; weightLabel?: WeightLabel }> = ({
  weight,
  weightLabel,
}) => {
  const filled = weightToPipCount(weight);
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      role="img"
      aria-label={weightLabel ? PIP_A11Y_LABEL[weightLabel] : undefined}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < filled
              ? 'bg-forest dark:bg-bitter-lime'
              : 'bg-stone-200 dark:bg-white/15'
          }`}
        />
      ))}
    </span>
  );
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
  // Bitter+ when the previous watch used an adaptive grid, else default to simple Bitter.
  const [useBitterPlus, setUseBitterPlus] = useState<boolean>(!previousIsLegacy);

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

  // Restore custom weights from the previous watch if it used the custom profile
  const seedCustomWeights = useMemo<Record<string, number>>(() => {
    if (previousAdaptive && previousAdaptive.profile.id === 'custom') {
      const map: Record<string, number> = { ...DEFAULT_CUSTOM_WEIGHTS };
      for (const c of previousAdaptive.criteria) map[c.key] = c.weight;
      return map;
    }
    return { ...DEFAULT_CUSTOM_WEIGHTS };
  }, [previousAdaptive]);

  const [criteriaValues, setCriteriaValues] = useState<Record<string, number>>(seedValues);
  const [customWeights, setCustomWeights] = useState<Record<string, number>>(seedCustomWeights);

  const lastRatings = lastWatch?.ratings ?? movie.ratings;
  const lastAvg =
    (lastRatings.story + lastRatings.visuals + lastRatings.acting + lastRatings.sound) / 4;

  const [sentiment, setSentiment] = useState<RewatchSentiment | null>(null);
  const [review, setReview] = useState('');

  const criteria: AdaptiveRatingCriterion[] = useBitterPlus
    ? buildCriteriaForProfile(profileId, criteriaValues, customWeights)
    : [];
  const bitterCriteria: AdaptiveRatingCriterion[] = useBitterPlus
    ? []
    : buildCriteriaForProfile('standard', criteriaValues);
  const bitterFinalRating =
    bitterCriteria.length === 0
      ? 0
      : Math.round(
          (bitterCriteria.reduce((s, c) => s + c.value, 0) / bitterCriteria.length) * 10
        ) / 10;
  const weightedRating = useBitterPlus ? calculateWeightedRating(criteria) : bitterFinalRating;
  const globalDiff = weightedRating - lastAvg;
  const watchNumber = (movie.watch_count ?? 1) + 1;

  const setCriterionValue = (key: string, value: number) => {
    setCriteriaValues((prev) => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }));
  };

  const setCustomWeight = (key: string, weight: number) => {
    haptics.soft();
    setCustomWeights((prev) => ({ ...prev, [key]: weight }));
  };

  const handleSave = () => {
    if (!sentiment) return;
    let ratings;
    let adaptiveRating;
    if (useBitterPlus) {
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
    } else {
      // Bitter (simple) mode: 4 direct values, no adaptiveRating.
      ratings = {
        story: criteriaValues.scenario ?? 5,
        visuals: criteriaValues.image ?? 5,
        acting: criteriaValues.interpretation ?? 5,
        sound: criteriaValues.sound ?? 5,
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

          {/* Bitter / Bitter+ mode switch */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-2xl p-2 shadow-sm">
            <div className="flex items-stretch gap-1" role="tablist" aria-label="Mode de notation">
              <button
                type="button"
                role="tab"
                aria-selected={!useBitterPlus}
                onClick={() => {
                  if (useBitterPlus) {
                    haptics.soft();
                    setUseBitterPlus(false);
                  }
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] ${
                  !useBitterPlus
                    ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal shadow-md'
                    : 'bg-transparent text-stone-400 dark:text-stone-500'
                }`}
              >
                Bitter
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={useBitterPlus}
                onClick={() => {
                  if (!useBitterPlus) {
                    haptics.soft();
                    setUseBitterPlus(true);
                  }
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] ${
                  useBitterPlus
                    ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal shadow-md'
                    : 'bg-transparent text-stone-400 dark:text-stone-500'
                }`}
              >
                Bitter+
              </button>
            </div>
            <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-2 mb-1 ml-1 leading-snug">
              {useBitterPlus
                ? 'Profil adapté, critères renforcés, note pondérée.'
                : 'Décompose ton ressenti en 4 critères.'}
            </p>
          </div>

          {/* Sentiments */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">
              Par rapport à la dernière fois ?
            </h3>
            <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 mb-3 leading-snug">
              Dis-nous ce que ce nouveau visionnage t’a fait ressentir.
            </p>
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
          {!useBitterPlus ? (
            <BitterRewatchRatings
              criteria={bitterCriteria}
              previousValues={previousAdaptive
                ? Object.fromEntries(previousAdaptive.criteria.map((c) => [c.key, c.value]))
                : {
                    scenario: lastRatings.story,
                    image: lastRatings.visuals,
                    interpretation: lastRatings.acting,
                    sound: lastRatings.sound,
                  }}
              onChange={setCriterionValue}
            />
          ) : (
            <div className="space-y-5">
              <div className="bg-stone-50 dark:bg-[#202020] border border-stone-200 dark:border-white/10 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                      Profil de notation
                    </p>
                    <p className="font-black text-base text-charcoal dark:text-white mt-1 truncate">
                      {getRatingProfile(profileId).label}
                    </p>
                    <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 leading-snug">
                      {profileId === 'custom'
                        ? 'Choisis les critères qui comptent le plus dans ta manière de noter ce film.'
                        : 'La grille est adaptée à ce type de film, mais tu peux la changer.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.soft();
                      setShowProfilePicker(true);
                    }}
                    className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-white dark:bg-[#252525] text-charcoal dark:text-white border border-stone-200 dark:border-white/10 active:scale-95 transition-all"
                  >
                    Changer
                  </button>
                </div>

                {profileId === 'custom' && (
                  <div className="mt-4 pt-4 border-t border-stone-200 dark:border-white/10 space-y-3">
                    {baseCriteria.map((c) => (
                      <CustomWeightRow
                        key={c.key}
                        label={c.label}
                        selectedWeight={customWeights[c.key] ?? 1.0}
                        onSelect={(w) => setCustomWeight(c.key, w)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-3">
                  Critères de notation
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
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                    Critère spécifique
                  </p>
                  <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 mb-3 leading-snug">
                    L’élément clé pour évaluer ce type de film.
                  </p>
                  <div className="space-y-3">
                    {specificCriteria.map((c) => (
                      <RewatchCriterionRow
                        key={c.key}
                        criterion={c}
                        previousValue={previousAdaptive?.criteria.find((x) => x.key === c.key)?.value}
                        onChange={setCriterionValue}
                        showDescription
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Note finale */}
          <div className="p-4 bg-forest/10 dark:bg-bitter-lime/10 rounded-2xl border border-forest/20 dark:border-bitter-lime/20">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-bitter-lime">
                Note finale
              </span>
              <div className="flex items-center gap-2 shrink-0">
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

const CustomWeightRow: React.FC<{
  label: string;
  selectedWeight: number;
  onSelect: (weight: number) => void;
}> = ({ label, selectedWeight, onSelect }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight flex-1 min-w-0 break-words">
      {label}
    </span>
    <div className="inline-flex items-center gap-1 shrink-0">
      {CUSTOM_WEIGHT_LEVELS.map((opt) => {
        const isSelected = Math.abs(selectedWeight - opt.weight) < 0.001;
        return (
          <button
            key={opt.label}
            type="button"
            aria-label={`Définir comme ${opt.label.toLowerCase()}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(opt.weight)}
            className={`h-8 px-2 rounded-lg flex items-center justify-center transition-all active:scale-90 border ${
              isSelected
                ? 'bg-charcoal text-white border-charcoal dark:bg-bitter-lime/15 dark:border-bitter-lime/40'
                : 'bg-white dark:bg-[#161616] border-stone-200 dark:border-white/5'
            }`}
          >
            <WeightPips weight={opt.weight} weightLabel={opt.label} />
          </button>
        );
      })}
    </div>
  </div>
);

const RewatchCriterionRow: React.FC<{
  criterion: AdaptiveRatingCriterion;
  previousValue?: number;
  onChange: (key: string, value: number) => void;
  showDescription?: boolean;
}> = ({ criterion, previousValue, onChange, showDescription }) => {
  const { key, label, value, weight, weightLabel, description } = criterion;
  const diff = previousValue != null ? value - previousValue : 0;
  return (
    <div>
      <div className="flex justify-between items-start mb-1.5 gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight break-words">
            {label}
          </span>
          <WeightPips weight={weight} weightLabel={weightLabel} />
          {showDescription && description && (
            <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-0.5">
              {description}
            </p>
          )}
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

const BitterRewatchRatings: React.FC<{
  criteria: AdaptiveRatingCriterion[];
  previousValues: Record<string, number>;
  onChange: (key: string, value: number) => void;
}> = ({ criteria, previousValues, onChange }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-3">
      Critères de notation
    </p>
    <div className="space-y-3">
      {criteria.map((c) => {
        const prev = previousValues[c.key];
        const diff = prev != null ? c.value - prev : 0;
        return (
          <div key={c.key}>
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight break-words flex-1 min-w-0">
                {c.label}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onChange(c.key, Math.max(0, c.value - 0.5))}
                  className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-[#202020] flex items-center justify-center active:scale-90 transition-all"
                >
                  <Minus size={11} strokeWidth={3} className="text-charcoal dark:text-white" />
                </button>
                <span className="text-[11px] font-black text-charcoal dark:text-white w-7 text-center tabular-nums">
                  {c.value.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(c.key, Math.min(10, c.value + 0.5))}
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
              value={c.value}
              onChange={(e) => onChange(c.key, parseFloat(e.target.value))}
              className="w-full accent-forest dark:accent-bitter-lime"
            />
          </div>
        );
      })}
    </div>
  </div>
);

export default RewatchModal;
