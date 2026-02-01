
import { Movie, ThemeColor } from './types';

// Application starts empty as requested
export const INITIAL_MOVIES: Movie[] = [];

export const GENRES = [
  'Action', 'Science-Fiction', 'Drame', 'Comédie', 'Thriller', 'Horreur', 'Romance', 'Documentaire', 'Biopic', 'Animation', 'Aventure'
];

export const TMDB_GENRE_MAP: Record<string, number> = {
  'Action': 28,
  'Science-Fiction': 878,
  'Drame': 18,
  'Comédie': 35,
  'Thriller': 53,
  'Horreur': 27,
  'Romance': 10749,
  'Documentaire': 99,
  'Biopic': 36,
  'Animation': 16,
  'Aventure': 12
};

export const THEME_COLORS: ThemeColor[] = ['orange', 'green', 'yellow', 'blue', 'purple', 'black'];

export const TMDB_API_KEY = 'c0b50025397f8839b2c49a4bcf377527';
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w780';
