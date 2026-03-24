import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL, GENRES, TMDB_GENRE_MAP } from '../constants';
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

export const getRecommendationsByGenres = async (
  genreNames: string[],
  existingTmdbIds: Set<number>
): Promise<any[]> => {
  const genreIds = genreNames.map((n) => TMDB_GENRE_MAP[n]).filter(Boolean);
  if (genreIds.length === 0) return [];
  const key = `byGenres:${genreIds.join(',')}`;
  const cached = getCachedData<any[]>(key);
  if (cached) return cached.filter((m) => !existingTmdbIds.has(m.id));
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR` +
        `&with_genres=${genreIds.join(',')}` +
        `&vote_average.gte=7.0&sort_by=popularity.desc&page=1`
    );
    const data = await res.json();
    const results = (data.results || []).filter((m: any) => m.poster_path);
    setCachedData(key, results);
    return results.filter((m: any) => !existingTmdbIds.has(m.id)).slice(0, 12);
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching by genres:', error);
    return [];
  }
};

export const getRecommendationsByDirectors = async (
  directorNames: string[],
  existingTmdbIds: Set<number>
): Promise<any[]> => {
  const recommendations: any[] = [];
  for (const name of directorNames) {
    try {
      const id = await searchPerson(name);
      if (!id) continue;
      const res = await fetch(
        `${TMDB_BASE_URL}/person/${id}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`
      );
      const data = await res.json();
      const directed = (data.crew || [])
        .filter((m: any) => m.job === 'Director' && m.poster_path)
        .sort((a: any, b: any) => b.vote_average - a.vote_average)
        .slice(0, 6);
      recommendations.push(...directed);
    } catch (error) {
      if (import.meta.env.DEV) console.error(`Error fetching director ${name}:`, error);
    }
  }
  const unique = Array.from(new Map(recommendations.map((m) => [m.id, m])).values());
  return unique.filter((m) => !existingTmdbIds.has(m.id)).slice(0, 12);
};

export const getRecommendationsByDecades = async (
  decades: number[],
  existingTmdbIds: Set<number>
): Promise<any[]> => {
  const recommendations: any[] = [];
  for (const decade of decades) {
    try {
      const res = await fetch(
        `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR` +
          `&primary_release_date.gte=${decade}-01-01` +
          `&primary_release_date.lte=${decade + 9}-12-31` +
          `&vote_average.gte=7.5&sort_by=vote_average.desc&page=1`
      );
      const data = await res.json();
      recommendations.push(...(data.results || []).slice(0, 6));
    } catch (error) {
      if (import.meta.env.DEV) console.error(`Error fetching decade ${decade}:`, error);
    }
  }
  const unique = Array.from(new Map(recommendations.map((m) => [m.id, m])).values());
  return unique
    .filter((m) => m.poster_path && !existingTmdbIds.has(m.id))
    .slice(0, 12);
};

export const getHiddenGems = async (
  genreNames: string[],
  existingTmdbIds: Set<number>
): Promise<any[]> => {
  const genreIds = genreNames.map((n) => TMDB_GENRE_MAP[n]).filter(Boolean);
  if (genreIds.length === 0) return [];
  const key = `gems:${genreIds.join(',')}`;
  const cached = getCachedData<any[]>(key);
  if (cached) return cached.filter((m) => !existingTmdbIds.has(m.id));
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR` +
        `&with_genres=${genreIds.join(',')}` +
        `&vote_average.gte=7.5&vote_count.gte=100&vote_count.lte=5000` +
        `&sort_by=vote_average.desc&page=1`
    );
    const data = await res.json();
    const results = (data.results || []).filter((m: any) => m.poster_path);
    setCachedData(key, results);
    return results.filter((m: any) => !existingTmdbIds.has(m.id)).slice(0, 12);
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching hidden gems:', error);
    return [];
  }
};
