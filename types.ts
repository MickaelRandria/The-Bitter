export interface RatingCriteria {
  story: number;
  visuals: number;
  acting: number;
  sound: number;
}

export type ThemeColor = 'orange' | 'green' | 'yellow' | 'blue' | 'purple' | 'black';

export type MovieStatus = 'watched' | 'watchlist';

export interface Movie {
  id: string;
  title: string;
  director: string;
  actors: string; // Comma separated list of main actors
  year: number;
  genre: string;
  ratings: RatingCriteria;
  review: string;
  dateAdded: number;
  theme: ThemeColor;
  posterUrl?: string; // Optional image URL
  status: MovieStatus;
}

export type MovieFormData = Omit<Movie, 'id' | 'dateAdded'>;