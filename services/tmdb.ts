import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL, GENRES } from '../constants';
import { MovieFormData } from '../types';

interface TMDBRecommendation {
  id: number;
  title: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
}

export const getRecommendations = async (tmdbId: number): Promise<TMDBRecommendation[]> => {
  try {
    const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}/recommendations?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`);
    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return [];
  }
};

export const getMovieDetailsForAdd = async (tmdbId: number): Promise<MovieFormData | null> => {
  try {
    const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
    const data = await res.json();
    
    const directorObj = data.credits?.crew?.find((p: any) => p.job === 'Director');
    const actorItems = data.credits?.cast?.slice(0, 3) || [];

    let genre = GENRES[0];
    if (data.genres && data.genres.length > 0) {
        const tmdbGenre = data.genres[0].name;
        const match = GENRES.find(g => g.toLowerCase() === tmdbGenre.toLowerCase()) || GENRES.find(g => tmdbGenre.includes(g));
        if (match) genre = match;
    }

    return {
        title: data.title,
        tmdbId: data.id,
        director: directorObj?.name || 'Inconnu',
        directorId: directorObj?.id,
        actors: actorItems.map((p: any) => p.name).join(', ') || '',
        actorIds: actorItems.map((p: any) => ({ id: p.id, name: p.name })),
        year: data.release_date ? parseInt(data.release_date.split('-')[0]) : new Date().getFullYear(),
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
        hype: 5
    };
  } catch (error) {
    console.error("Error fetching movie details:", error);
    return null;
  }
};