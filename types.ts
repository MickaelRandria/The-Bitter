export interface RatingCriteria {
  story: number;
  visuals: number;
  acting: number;
  sound: number;
}

export interface QualityMetrics {
  scenario: number;
  acting: number;
  visual: number;
  sound: number;
}

export type ThemeColor = 'orange' | 'green' | 'yellow' | 'blue' | 'purple' | 'black';

export type MovieStatus = 'watched' | 'watchlist';

export type PacingType = 'slow' | 'perfect' | 'fast';

export interface ActorInfo {
  id: number;
  name: string;
}

export interface VibeCriteria {
  story: number;
  emotion: number;
  fun: number;
  visual: number;
  tension: number;
}

export type RewatchSentiment = 'better' | 'same' | 'worse' | 'disappointed' | 'discovered' | 'nostalgic';

export type CinemaSubscriptionProvider = 'ugc' | 'pathe' | 'custom';

/**
 * Abonnement cinéma de l'utilisateur.
 *
 * Les deux tarifs sont saisis par l'utilisateur : les valeurs préremplies des
 * fournisseurs connus ne sont que des points de départ modifiables. Le modèle ne
 * conserve volontairement pas d'historique tarifaire (voir utils/cinemaSubscription).
 */
export interface CinemaSubscription {
  id: string;
  provider: CinemaSubscriptionProvider;
  name: string;
  /** Mensualité réellement payée. */
  monthlyPrice: number;
  /** Prix d'une place au tarif normal, sert à valoriser les séances. */
  referenceTicketPrice: number;
  /** Date de début, au format ISO. Les séances antérieures sont ignorées. */
  startDate: string;
  active: boolean;
  createdAt: string;
}

/**
 * Une sortie prévue, avant tout lien éventuel avec la watchlist ou un film vu.
 * Un titre libre est autorisé : on ne connaît pas toujours la fiche TMDB au
 * moment où quelqu'un réserve sa séance.
 */
export type CinemaScreeningStatus = 'scheduled' | 'cancelled' | 'completed';

export interface CinemaScreening {
  id: string;
  profileId: string;
  tmdbId?: number;
  title: string;
  posterUrl?: string;
  startsAt: number;
  cinemaName?: string;
  cinemaAddress?: string;
  format?: string;
  notes?: string;
  status: CinemaScreeningStatus;
  reminderOffsetsMinutes: number[];
  createdAt: number;
  updatedAt: number;
}

export interface CinemaScreeningInput {
  tmdbId?: number;
  title: string;
  posterUrl?: string;
  startsAt: number;
  cinemaName?: string;
  cinemaAddress?: string;
  format?: string;
  notes?: string;
  reminderOffsetsMinutes?: number[];
}

export type ViewingLocationType = 'cinema' | 'home' | 'other';

export type CinemaViewingPaymentType = 'subscription' | 'paid' | 'invitation' | 'other';

/**
 * Contexte d'une séance. Porté par MovieWatch et non par Movie : un même film peut
 * être vu chez soi, puis au cinéma avec l'abonnement, puis sur invitation.
 */
export interface ViewingContext {
  locationType: ViewingLocationType;
  cinemaProvider?: CinemaSubscriptionProvider | 'other';
  cinemaName?: string;
  paymentType?: CinemaViewingPaymentType;
  /** Renseigné uniquement quand paymentType vaut 'subscription'. */
  subscriptionId?: string;
  ticketPrice?: number;
}

export interface MovieWatch {
  id: string;
  watch_number: number;
  watched_at: string;
  ratings: RatingCriteria;
  review?: string;
  sentiment?: RewatchSentiment;
  adaptiveRating?: AdaptiveRatingData;
  /** Absent sur toutes les séances antérieures à la fonctionnalité abonnement. */
  viewingContext?: ViewingContext;
}

export type CriterionGroup = 'base' | 'specific';
export type WeightLabel = 'Essentiel' | 'Important' | 'Standard' | 'Secondaire';

export interface AdaptiveRatingCriterion {
  key: string;
  label: string;
  value: number;
  weight: number;
  weightLabel: WeightLabel;
  group: CriterionGroup;
  description?: string;
}

export interface AdaptiveRatingProfileRef {
  id: string;
  label: string;
  version: number;
}

/**
 * Les traces laissées par un film. L'ordre est significatif : les trois premières
 * sont les empreintes dominantes, les suivantes des nuances.
 */
export type EmotionalImprint =
  | 'emotion'
  | 'wonder'
  | 'jubilation'
  | 'fascination'
  | 'tension'
  | 'malaise'
  | 'trouble'
  | 'shock'
  | 'haunting'
  | 'reflection'
  | 'frustration'
  | 'disappointment'
  | 'indifference';

export interface AdaptiveRatingData {
  profile: AdaptiveRatingProfileRef;
  criteria: AdaptiveRatingCriterion[];
  weightedRating: number;
  legacyRating?: number;
  /** Persisté dans le JSON Bitter+ : aucune colonne ou règle d'accès supplémentaire. */
  imprints?: EmotionalImprint[];
}

export interface Movie {
  id: string;
  tmdbId?: number;
  title: string;
  director: string;
  directorId?: number;
  actors: string;
  actorIds?: ActorInfo[];
  year: number;
  releaseDate?: string;
  runtime?: number;
  genre: string;
  ratings: RatingCriteria;
  review: string;
  comment?: string;
  dateAdded: number;
  dateWatched?: number;
  theme: ThemeColor;
  posterUrl?: string;
  status: MovieStatus;
  tmdbRating?: number;
  rewatch?: boolean;
  tags?: string[];
  smartphoneFactor?: number;
  vibe?: VibeCriteria;
  qualityMetrics?: QualityMetrics;
  hype?: number;
  pacing?: PacingType;
  symptoms?: string[];
  // Nouveaux champs pour Séries TV
  mediaType?: 'movie' | 'tv';
  numberOfSeasons?: number;
  // Système rewatch
  watch_count?: number;
  watches?: MovieWatch[];
  first_rating?: number;
  current_rating?: number;
  avg_rating?: number;
  preferred_display_mode?: 'latest' | 'average';
  // Système de notation adaptatif (V1)
  adaptiveRating?: AdaptiveRatingData;
  /** Faux quand l'utilisateur retire ce film du fil de ses espaces. */
  shareToFeed?: boolean;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  gender?: 'h' | 'f';
  age?: number;
  viewingPreference?: 'cinema' | 'streaming' | 'both';
  streamingPlatforms?: string[];
  movies: Movie[];
  createdAt: number;
  seenTutorials?: string[];
  severityIndex?: number;
  patienceLevel?: number; // Used as Rhythm Index in V2 Logic
  favoriteGenres?: string[];
  depthIndex?: number; // Optional: inferred from genres
  isOnboarded?: boolean;
  role?: string;
  joinedSpaceIds?: string[];
  /** Descripteur `dicebear:style:graine`, ou URL d'image. Voir utils/avatar.ts. */
  avatarUrl?: string;
  cinemaSubscription?: CinemaSubscription;
}

export type MovieFormData = Omit<Movie, 'id' | 'dateAdded'>;

export interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  media_type?: 'movie' | 'tv';
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}
