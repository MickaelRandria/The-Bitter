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

export const getTopRatedRecommendations = async (
  topMovies: { tmdbId: number }[],
  existingTmdbIds: Set<number>
): Promise<(TMDBRecommendation & { _score: number })[]> => {
  const allResults = await Promise.all(topMovies.map((m) => getRecommendations(m.tmdbId)));

  const map = new Map<number, { movie: TMDBRecommendation; freq: number }>();
  allResults.forEach((results) => {
    results.forEach((movie) => {
      if (!movie.poster_path || existingTmdbIds.has(movie.id)) return;
      const entry = map.get(movie.id);
      if (entry) entry.freq++;
      else map.set(movie.id, { movie, freq: 1 });
    });
  });

  return Array.from(map.values())
    .map(({ movie, freq }) => ({
      ...movie,
      _score: (freq / topMovies.length) * 6 + (movie.vote_average / 10) * 4,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
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

export async function searchMovieForImport(title: string, year?: string): Promise<MovieFormData | null> {
  try {
    let url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=fr-FR`;
    if (year) url += `&year=${year}`;

    let res = await fetch(url);
    let data = await res.json();

    // Retry without year if no results
    if (!data.results?.length && year) {
      res = await fetch(
        `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=fr-FR`
      );
      data = await res.json();
    }

    if (!data.results?.length) return null;
    return await getMovieDetailsForAdd(data.results[0].id);
  } catch {
    return null;
  }
}

export const getSharedMovieDetails = async (tmdbId: number): Promise<{
  synopsis?: string;
  runtime?: number;
  genres?: string[];
  actors?: string;
  trailer_key?: string;
  tmdb_rating?: number;
}> => {
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos&language=fr-FR`
    );
    const data = await res.json();
    const trailer = data.videos?.results?.find(
      (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
    );
    return {
      synopsis: data.overview || undefined,
      runtime: data.runtime || undefined,
      genres: data.genres?.map((g: any) => g.name) || undefined,
      actors: data.credits?.cast?.slice(0, 5).map((a: any) => a.name).join(', ') || undefined,
      trailer_key: trailer?.key || undefined,
      tmdb_rating: data.vote_average || undefined,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Error fetching shared movie details:', error);
    return {};
  }
};

// ===============================================
// SORTIES EN SALLE
// ===============================================

export interface TheatreRelease {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  overview: string;
  voteAverage: number;
  genreIds: number[];
}

export interface TheatreReleases {
  thisWeek: TheatreRelease[];
  upcoming: TheatreRelease[];
}

const RELEASES_CACHE_KEY = 'bitter_theatre_releases_v3';
/** Les sorties changent une fois par semaine : rappeler TMDB plus souvent ne sert à rien. */
const RELEASES_TTL_MS = 6 * 60 * 60 * 1000;

const isoDay = (date: Date) => date.toISOString().split('T')[0];

/**
 * Une reprise porte la date de sa sortie d'origine, pas celle de sa ressortie.
 *
 * TMDB renvoie Matrix, Alien ou 2001 dans la fenêtre parce qu'ils ont bien une
 * sortie en salle française récente. Affichés au milieu des nouveautés avec leur
 * année d'origine, ils donnent l'impression d'une liste cassée. On les écarte
 * plutôt que de les expliquer.
 */
const isRecent = (film: TheatreRelease, from: Date) => {
  const year = Number((film.releaseDate || '').slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return year >= from.getFullYear() - 1;
};

const toRelease = (row: any): TheatreRelease => ({
  id: row.id,
  title: row.title,
  posterPath: row.poster_path ?? null,
  releaseDate: row.release_date || '',
  overview: row.overview || '',
  voteAverage: row.vote_average || 0,
  genreIds: row.genre_ids || [],
});

const fetchWindow = async (
  region: string,
  gte: string,
  lte: string
): Promise<TheatreRelease[]> => {
  // Trois choix qui décident entièrement de la pertinence de la liste :
  //
  // `release_date` et non `primary_release_date`. Le second est la date de première
  // MONDIALE : filtrer dessus écarte tous les films étrangers qui sortent en France
  // cette semaine, et ne laisse que ceux dont la première mondiale tombe dans la
  // fenêtre, c'est-à-dire surtout de petites productions locales. Couplé à `region`,
  // `release_date` donne bien la date de sortie française.
  //
  // `popularity.desc` et non un tri par date. TMDB publie des centaines de sorties
  // par semaine, documentaires et reprises comprises ; sans hiérarchie, la liste est
  // un inventaire, pas une sélection. La popularité vaut aussi pour un film sans
  // aucune note, elle vient des consultations et pas des votes.
  //
  // `with_runtime.gte=60` écarte les courts métrages, qui ne sortent pas en salle
  // au sens où l'entend quelqu'un qui cherche quoi aller voir.
  const url =
    `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR` +
    `&region=${region}&with_release_type=3|2` +
    `&release_date.gte=${gte}&release_date.lte=${lte}` +
    `&sort_by=popularity.desc&with_runtime.gte=60&page=1`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return (data.results || []).map(toRelease);
};

/**
 * Sorties de la semaine et sorties à venir, pour une région donnée.
 *
 * `now_playing` et `upcoming` de TMDB seraient plus courts à écrire, mais ils sont
 * flous : `upcoming` contient des films déjà sortis ailleurs, et le résultat bouge
 * d'un jour à l'autre sans raison. `discover` avec une fenêtre de dates explicite
 * donne une liste stable, dont on peut expliquer le contenu.
 */
export const getTheatreReleases = async (
  region: string,
  { force = false }: { force?: boolean } = {}
): Promise<TheatreReleases> => {
  const cacheKey = `${RELEASES_CACHE_KEY}_${region}`;

  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.at < RELEASES_TTL_MS) {
        return cached.data as TheatreReleases;
      }
    } catch {
      // Un cache illisible n'est pas une erreur : on le remplace.
    }
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 45);

  /**
   * Cinq semaines et non une.
   *
   * « Au cinéma » veut dire ce qu'on peut aller voir ce soir, pas ce qui est sorti
   * mercredi. Une semaine française compte une dizaine de sorties dont deux ou trois
   * notables : la liste était juste, et vide de sens. Sur cinq semaines, un film reste
   * à l'affiche, et la sélection ressemble enfin à un programme.
   */
  const showingSince = new Date(today);
  showingSince.setDate(showingSince.getDate() - 35);

  const [thisWeek, upcoming] = await Promise.all([
    fetchWindow(region, isoDay(showingSince), isoDay(today)),
    fetchWindow(region, isoDay(tomorrow), isoDay(horizon)),
  ]);

  const data: TheatreReleases = {
    // La popularité décide de ce qui entre dans la liste, la date de l'ordre dans
    // lequel on la lit : à venir, on veut savoir ce qui arrive en premier.
    thisWeek: thisWeek.filter((f) => isRecent(f, today)).slice(0, 12),
    upcoming: upcoming
      .filter((f) => isRecent(f, today))
      .slice(0, 20)
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)),
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Stockage plein ou refusé : on sert la donnée fraîche sans la mémoriser.
  }

  return data;
};
