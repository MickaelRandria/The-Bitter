export interface RatingCriteria {
  story: number;
  visuals: number;
  acting: number;
  sound: number;
}

export interface QualityMetrics {
  scenario: number; // Note technique /10
  acting: number;   // Note technique /10
  visual: number;   // Note technique /10
  sound: number;    // Note technique /10
}

export type ThemeColor = 'orange' | 'green' | 'yellow' | 'blue' | 'purple' | 'black';

export type MovieStatus = 'watched' | 'watchlist';

export type PacingType = 'slow' | 'perfect' | 'fast';

export interface ActorInfo {
  id: number;
  name: string;
}

export interface VibeCriteria {
  story: number;    // Scénario / Intello
  emotion: number;  // Larmes / Frissons
  fun: number;      // Divertissement / Rire
  visual: number;   // Esthétique / FX
  tension: number;  // Rythme / Suspense
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
  releaseDate?: string; // Format YYYY-MM-DD
  runtime?: number;
  genre: string;
  ratings: RatingCriteria; // Legacy support (Derived from QualityMetrics or Manual Global)
  review: string;
  dateAdded: number;
  dateWatched?: number;
  theme: ThemeColor;
  posterUrl?: string;
  status: MovieStatus;
  tmdbRating?: number;
  rewatch?: boolean;
  tags?: string[];
  
  // Bitter Mode Additions
  smartphoneFactor?: number; // 0-100
  vibe?: VibeCriteria;
  qualityMetrics?: QualityMetrics;
  
  // New Experience Fields
  hype?: number; // 0-10
  pacing?: PacingType;
  symptoms?: string[];
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  gender?: 'h' | 'f';
  age?: number;
  favoriteMovie: string;
  movies: Movie[];
  createdAt: number;
  seenTutorials?: string[];
  
  // Calibration Analyste
  severityIndex?: number; // 0-10
  patienceLevel?: number; // 0-10
  favoriteGenres?: string[];
  isOnboarded?: boolean;
  role?: string; // Archétype calculé
}

export type MovieFormData = Omit<Movie, 'id' | 'dateAdded'>;