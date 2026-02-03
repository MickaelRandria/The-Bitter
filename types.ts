
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
  patienceLevel?: number;
  favoriteGenres?: string[];
  isOnboarded?: boolean;
  role?: string;
}

export type MovieFormData = Omit<Movie, 'id' | 'dateAdded'>;
