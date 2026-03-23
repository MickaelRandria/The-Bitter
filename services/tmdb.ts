import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL, GENRES } from '../constants';
import { MovieFormData } from '../types';
import { getCachedData, setCachedData } from '../utils/cache';

interface TMDBRecommendation {
  id: number;
  title: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
}

export const getRecommendations = async (tmdbId: number): Promise<TMDBRecommendation[]> => {
  const key = `recommendations:${tmdbId}`;
  const cached = getCachedData<TMDBRecommendation[]>(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}/recommendations?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`
    );
    const data = await res.json();
    const results = data.results || [];
    setCachedData(key, results);
    return results;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching recommendations:', error);
    return [];
  }
};

export const getDirectorMovies = async (directorId: number): Promise<any[]> => {
  const key = `director:${directorId}`;
  const cached = getCachedData<any[]>(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/person/${directorId}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`
    );
    const data = await res.json();
    const directed = data.crew?.filter((m: any) => m.job === 'Director') || [];
    const results = directed
      .sort(
        (a: any, b: any) =>
          b.vote_average * b.vote_count - a.vote_average * a.vote_count ||
          b.popularity - a.popularity
      )
      .slice(0, 10);
    setCachedData(key, results);
    return results;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching director movies:', error);
    return [];
  }
};

export const searchPerson = async (query: string): Promise<number | null> => {
  const key = `person:${query}`;
  const cached = getCachedData<number>(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=fr-FR`
    );
    const data = await res.json();
    const id = data.results?.[0]?.id || null;
    if (id) setCachedData(key, id);
    return id;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error searching person:', error);
    return null;
  }
};

export const getMovieDetailsForAdd = async (tmdbId: number): Promise<MovieFormData | null> => {
  const key = `movieDetails:${tmdbId}`;
  const cached = getCachedData<MovieFormData>(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`
    );
    const data = await res.json();

    const directorObj = data.credits?.crew?.find((p: any) => p.job === 'Director');
    const actorItems = data.credits?.cast?.slice(0, 3) || [];

    let genre = GENRES[0];
    if (data.genres && data.genres.length > 0) {
      const tmdbGenre = data.genres[0].name;
      const match =
        GENRES.find((g) => g.toLowerCase() === tmdbGenre.toLowerCase()) ||
        GENRES.find((g) => tmdbGenre.includes(g));
      if (match) genre = match;
    }

    const result: MovieFormData = {
      title: data.title,
      tmdbId: data.id,
      director: directorObj?.name || 'Inconnu',
      directorId: directorObj?.id,
      actors: actorItems.map((p: any) => p.name).join(', ') || '',
      actorIds: actorItems.map((p: any) => ({ id: p.id, name: p.name })),
      year: data.release_date
        ? parseInt(data.release_date.split('-')[0])
        : new Date().getFullYear(),
      releaseDate: data.release_date || '',
      runtime: data.runtime || 0,
      genre,
      ratings: { story: 0, visuals: 0, acting: 0, sound: 0 }, // Default for watchlist
      review: data.overview || '',
      theme: 'black',
      posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
      status: 'watchlist',
      dateWatched: Date.now(), // Will be overwritten by logic if needed
      tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0,
      rewatch: false,
      tags: [],
      smartphoneFactor: 0,
      hype: 5,
    };
    setCachedData(key, result);
    return result;
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching movie details:', error);
    return null;
  }
};
