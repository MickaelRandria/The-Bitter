import {
  AdaptiveRatingCriterion,
  AdaptiveRatingData,
  Movie,
  RatingCriteria,
  WeightLabel,
} from '../types';
import {
  ADAPTIVE_RATING_VERSION,
  AnyProfileId,
  CriterionDefinition,
  RatingProfileId,
  detectRatingProfile as detectFromGenres,
  getRatingProfile,
} from '../config/ratingProfiles';

export function getWeightLabel(weight: number): WeightLabel {
  if (weight >= 1.7) return 'Essentiel';
  if (weight >= 1.3) return 'Important';
  if (weight <= 0.8) return 'Secondaire';
  return 'Standard';
}

export function detectRatingProfile(genres: string | string[] | undefined | null): RatingProfileId {
  return detectFromGenres(genres);
}

export function buildCriteriaForProfile(
  profileId: RatingProfileId,
  existingValues?: Record<string, number>,
  customWeights?: Record<string, number>
): AdaptiveRatingCriterion[] {
  const profile = getRatingProfile(profileId);
  const overrideWeights = profileId === 'custom' && customWeights;
  return profile.criteria.map<AdaptiveRatingCriterion>((c: CriterionDefinition) => {
    const weight = overrideWeights ? customWeights![c.key] ?? c.weight : c.weight;
    return {
      key: c.key,
      label: c.label,
      value: existingValues?.[c.key] ?? 5,
      weight,
      weightLabel: getWeightLabel(weight),
      group: c.group,
      description: c.description,
    };
  });
}

export function calculateWeightedRating(criteria: AdaptiveRatingCriterion[]): number {
  if (criteria.length === 0) return 0;
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = criteria.reduce((s, c) => s + c.value * c.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

export function buildAdaptiveRating(
  profileId: RatingProfileId,
  values: Record<string, number>,
  legacyRating?: number,
  customWeights?: Record<string, number>
): AdaptiveRatingData {
  const profile = getRatingProfile(profileId);
  const criteria = buildCriteriaForProfile(profileId, values, customWeights);
  const weightedRating = calculateWeightedRating(criteria);
  return {
    profile: { id: profile.id, label: profile.label, version: ADAPTIVE_RATING_VERSION },
    criteria,
    weightedRating,
    legacyRating,
  };
}

/**
 * Maps the legacy 4-criteria ratings to an AdaptiveRatingData object using the
 * `standard_legacy` pseudo-profile. Used as a fallback for display when a movie
 * has no native adaptive rating yet. Does NOT recalculate the note (returns the
 * straight average from the existing criteria) — see project memory for rules.
 */
export function mapLegacyRatingToAdaptiveRating(
  ratings: RatingCriteria
): AdaptiveRatingData {
  const criteria: AdaptiveRatingCriterion[] = [
    { key: 'scenario', label: 'Scénario', value: ratings.story, weight: 1.0, weightLabel: 'Standard', group: 'base' },
    { key: 'image', label: 'Image', value: ratings.visuals, weight: 1.0, weightLabel: 'Standard', group: 'base' },
    { key: 'interpretation', label: 'Interprétation', value: ratings.acting, weight: 1.0, weightLabel: 'Standard', group: 'base' },
    { key: 'sound', label: 'Sonore', value: ratings.sound, weight: 1.0, weightLabel: 'Standard', group: 'base' },
  ];
  return {
    profile: { id: 'standard_legacy', label: 'Ancienne notation', version: 0 },
    criteria,
    weightedRating: calculateWeightedRating(criteria),
  };
}

/**
 * Maps an AdaptiveRatingData back to the legacy RatingCriteria shape so that
 * legacy code (analytics, archetypes, display helpers) keeps working.
 * Falls back to 0 for missing base criteria.
 */
export function adaptiveToLegacyRatings(adaptive: AdaptiveRatingData): RatingCriteria {
  const byKey = new Map(adaptive.criteria.map((c) => [c.key, c.value]));
  return {
    story: byKey.get('scenario') ?? 0,
    visuals: byKey.get('image') ?? 0,
    acting: byKey.get('interpretation') ?? 0,
    sound: byKey.get('sound') ?? 0,
  };
}

export function getMovieAdaptiveProfileId(movie: Movie): AnyProfileId | null {
  return (movie.adaptiveRating?.profile.id as AnyProfileId | undefined) ?? null;
}

export function isLegacyOnlyMovie(movie: Movie): boolean {
  return !movie.adaptiveRating;
}

export interface DisplayRatingCriterion {
  key: string;
  label: string;
  value: number;
  weightLabel: WeightLabel;
  weight: number;
  group: 'base' | 'specific';
  isHighlighted: boolean; // Essentiel ou Important
  isSpecific: boolean;
  description?: string;
}

/**
 * Normalized criterion list for display in Movie Card / Story / Detail.
 * Uses adaptiveRating when present, otherwise maps the legacy 4 ratings to the
 * new labels (Scénario / Image / Interprétation / Sonore). Order is always:
 * base criteria first, specific criterion last.
 */
export function getDisplayRatingCriteria(movie: Movie): DisplayRatingCriterion[] {
  const source: AdaptiveRatingCriterion[] = movie.adaptiveRating
    ? movie.adaptiveRating.criteria
    : mapLegacyRatingToAdaptiveRating(movie.ratings).criteria;

  const ordered = [
    ...source.filter((c) => c.group === 'base'),
    ...source.filter((c) => c.group === 'specific'),
  ];

  return ordered.map<DisplayRatingCriterion>((c) => ({
    key: c.key,
    label: c.label,
    value: c.value,
    weightLabel: c.weightLabel,
    weight: c.weight,
    group: c.group,
    isHighlighted: c.weightLabel === 'Essentiel' || c.weightLabel === 'Important',
    isSpecific: c.group === 'specific',
    description: c.description,
  }));
}

/** Note finale à afficher (Movie Card / Story / Detail). */
export function getDisplayWeightedRating(movie: Movie): number {
  if (movie.adaptiveRating) return movie.adaptiveRating.weightedRating;
  const r = movie.ratings;
  return Math.round(((r.story + r.visuals + r.acting + r.sound) / 4) * 10) / 10;
}
