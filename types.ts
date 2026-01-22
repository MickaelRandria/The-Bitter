export interface RatingCriteria {
  story: number;
  visuals: number;
  acting: number;
  sound: number;
}

export type ThemeColor = 'orange' | 'green' | 'yellow' | 'blue' | 'purple' | 'black';

export type MovieStatus = 'watched' | 'watchlist';

export interface ActorInfo {
  id: number;
  name: string;
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
  runtime?: number; // Nouveau : Durée en minutes
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
}

export type MovieFormData = Omit<Movie, 'id' | 'dateAdded'>;