import {
  AdaptiveRatingCriterion,
  AdaptiveRatingData,
  Movie,
  RatingCriteria,
  TvEpisodeEntry,
  TvProgress,
  WeightLabel,
} from '../types';
import { episodeAverage } from './tvProgress';
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

export function detectRatingProfile(
  genres: string | string[] | undefined | null,
  mediaType?: 'movie' | 'tv'
): RatingProfileId {
  return detectFromGenres(genres, mediaType);
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

/**
 * Un verdict a-t-il été posé sur cette œuvre ?
 *
 * `getDisplayWeightedRating` rend 0 aussi bien pour « pas encore noté » que pour
 * « noté zéro partout ». La distinction est sans conséquence sur un film — on
 * regarde son statut — mais elle change la note d'une série : une saison non
 * notée doit être **exclue** de la moyenne, jamais comptée comme un zéro.
 *
 * La présence d'`adaptiveRating` tranche le cas d'un vrai zéro : passer par la
 * grille Bitter+ laisse une trace même si tous les curseurs sont au minimum.
 * Pour l'ancienne notation, un tout-à-zéro reste indistinguable d'une absence
 * sur un film ; c'est une ambiguïté héritée, pas une régression.
 *
 * Une **saison** tranche autrement : elle n'entre dans la collection que parce
 * qu'on est allé la noter, et une date de visionnage confirme le geste. Un zéro
 * partout y est donc un verdict et non un silence — l'exclure de la moyenne de
 * la série la relèverait au lieu de la refléter.
 */
export function hasVerdict(movie: Movie): boolean {
  if (movie.adaptiveRating) return true;
  if (
    movie.mediaType === 'tv' &&
    movie.seasonNumber != null &&
    movie.status === 'watched' &&
    movie.dateWatched != null
  )
    return true;
  const r = movie.ratings;
  return r.story > 0 || r.visuals > 0 || r.acting > 0 || r.sound > 0;
}

/**
 * Les deux notes d'une saison, et celle qui la représente.
 *
 * POURQUOI DEUX NOTES ET NON UNE
 * Elles ne répondent pas à la même question. La moyenne des épisodes dit ce que
 * la saison a valu **épisode après épisode** ; le verdict global dit ce qu'il en
 * reste une fois la saison finie. Les deux divergent souvent, et l'écart est
 * justement ce qu'on vient lire : une saison de dix épisodes tièdes qui décolle
 * à la fin laisse un meilleur souvenir que sa moyenne, une saison régulière mais
 * sans mémoire laisse l'inverse. Les fondre en un chiffre effacerait cet écart.
 *
 * `overall` est celle qui représente la saison partout ailleurs. Le verdict
 * global gagne quand il existe : quelqu'un l'a posé, alors que la moyenne n'est
 * qu'un calcul. Sans verdict, la moyenne prend le relais plutôt que de laisser
 * une saison regardée et notée épisode par épisode compter pour rien.
 */
export interface SeasonScores {
  episodes: { average: number; count: number } | null;
  global: number | null;
  overall: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function seasonScores(
  seasonMovie: Movie | undefined,
  entries: TvEpisodeEntry[],
  seasonNumber: number
): SeasonScores {
  const episodes = episodeAverage(entries, seasonNumber);
  const global = seasonMovie && hasVerdict(seasonMovie) ? getDisplayWeightedRating(seasonMovie) : null;
  const episodeScore = episodes ? { average: round1(episodes.average), count: episodes.count } : null;
  return {
    episodes: episodeScore,
    global: global == null ? null : round1(global),
    overall: global != null ? round1(global) : episodeScore?.average ?? null,
  };
}

export interface SeriesRating {
  /** Moyenne non pondérée des saisons notées. */
  average: number;
  /** Combien de saisons ont réellement un verdict — sert au libellé. */
  ratedSeasons: number;
}

/**
 * Note d'une série : la moyenne **non pondérée** de ses saisons notées.
 *
 * Non pondérée volontairement : une saison de vingt épisodes ne doit pas
 * écraser une saison courte. Pondérer par la durée serait un autre choix, qu'il
 * faudrait alors expliquer à l'écran plutôt que d'appliquer en silence.
 *
 * Une saison compte dès qu'elle a une note, qu'elle vienne d'un verdict global
 * ou de ses seuls épisodes (voir `seasonScores`). Les deux entrent dans la
 * moyenne au même titre : ce sont deux façons de juger une saison, pas deux
 * qualités de jugement.
 *
 * Rend `null` quand aucune saison n'est notée — l'appelant affiche alors le
 * verdict global historique s'il en existe un, et surtout pas un zéro.
 */
export function getSeriesRating(seasons: Movie[], progress?: TvProgress): SeriesRating | null {
  const byNumber = new Map(seasons.map((s) => [s.seasonNumber as number, s]));
  const entries = Object.values(progress?.episodes ?? {});

  // Une saison peut n'exister que dans les épisodes : on l'a notée épisode par
  // épisode sans jamais poser de verdict global. L'ignorer reviendrait à dire
  // que la série n'est pas notée alors qu'on vient d'en juger vingt épisodes.
  const numbers = new Set<number>([...byNumber.keys(), ...entries.map((e) => e.seasonNumber)]);

  const scores = [...numbers]
    .map((n) => seasonScores(byNumber.get(n), entries, n).overall)
    .filter((score): score is number => score != null);

  if (scores.length === 0) return null;

  return {
    average: round1(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    ratedSeasons: scores.length,
  };
}
