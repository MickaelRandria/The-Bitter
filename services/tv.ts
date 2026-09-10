import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { getCachedData, setCachedData } from '../utils/cache';

export interface TvEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate?: string;
  runtime?: number;
  /** L'image de l'épisode (`still_path`), en 16/9. Absente sur les inédits. */
  still?: string;
  overview?: string;
  /**
   * La note TMDB, celle de tout le monde. À ne pas confondre avec la sienne.
   *
   * TMDB rend `0` pour un épisode que personne n'a noté — ce n'est pas un zéro,
   * c'est une absence. On l'écarte ici plutôt que d'afficher « 0.0 » sous
   * chaque inédit.
   */
  voteAverage?: number;
}

async function request(path: string, language: string) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${TMDB_BASE_URL}/${path}${separator}api_key=${TMDB_API_KEY}&language=${language}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('TMDB unavailable');
  return response.json();
}

export async function getSeasonEpisodes(id: number, season: number, language = 'fr-FR'): Promise<TvEpisode[]> {
  const key = `tvEpisodes:${id}:${season}:${language}`;
  const cached = getCachedData<TvEpisode[]>(key);
  if (cached) return cached;
  const data = await request(`tv/${id}/season/${season}`, language);
  const episodes = (data.episodes ?? []).map((e: any) => ({
    id: e.id,
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name,
    airDate: e.air_date || undefined,
    runtime: e.runtime || undefined,
    still: e.still_path ? `${TMDB_IMAGE_URL}${e.still_path}` : undefined,
    overview: e.overview || undefined,
    voteAverage: e.vote_average > 0 ? e.vote_average : undefined,
  }));
  setCachedData(key, episodes);
  return episodes;
}

/**
 * Traduit des identifiants de genres TMDB « film » vers leur équivalent « série ».
 *
 * Les deux catalogues sont distincts : TMDB n'a ni Action, ni Aventure, ni
 * Science-Fiction, ni Thriller, ni Horreur, ni Romance côté séries. Envoyer un
 * identifiant de film à `discover/tv` ne renvoie pas moins de résultats : il n'en
 * renvoie **aucun**, sans erreur. Une recherche par envie qui ne rend rien est
 * indistinguable d'une envie trop pointue, d'où cette table.
 *
 * Les genres absents du catalogue séries sont retirés plutôt que rapprochés de
 * force : mieux vaut un filtre en moins qu'un contresens.
 */
const MOVIE_TO_TV_GENRE: Record<number, number> = {
  28: 10759, // Action → Action & Adventure
  12: 10759, // Aventure → Action & Adventure
  878: 10765, // Science-Fiction → Sci-Fi & Fantasy
  14: 10765, // Fantastique → Sci-Fi & Fantasy
  10752: 10768, // Guerre → War & Politics
  53: 9648, // Thriller → Mystère
  27: 9648, // Horreur → Mystère
};

/** Genres sans équivalent série : Romance, Musique, Téléfilm. */
const MOVIE_ONLY_GENRES = [10749, 10402, 10770];

export const toTvGenreIds = (ids: number[]): number[] => [
  ...new Set(ids.map((id) => MOVIE_TO_TV_GENRE[id] ?? id).filter((id) => !MOVIE_ONLY_GENRES.includes(id))),
];

export interface TvRelease {
  id: number;
  title: string;
  poster?: string;
  date: string;
  season?: number;
  episode?: number;
  kind: 'new' | 'season' | 'episode';
  providers: string[];
}

export async function getTvUpcoming(followedIds: number[] = [], language = 'fr-FR', followedOnly = false): Promise<TvRelease[]> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const cacheKey = `tvUpcoming:${today}:${language}:${followedOnly}:${[...followedIds].sort().join(',')}`;
  const cached = getCachedData<TvRelease[]>(cacheKey);
  if (cached) return cached;
  const until = new Date(); until.setDate(until.getDate() + 90);
  const end = until.toISOString().slice(0, 10);
  const ids = new Set(followedIds);
  if (!followedOnly) {
    const pages = await Promise.all([
      request(`discover/tv?first_air_date.gte=${today}&first_air_date.lte=${end}&sort_by=popularity.desc&include_adult=false`, language),
      request(`discover/tv?air_date.gte=${today}&air_date.lte=${end}&sort_by=popularity.desc&include_adult=false`, language),
    ]);
    for (const page of pages) for (const item of (page.results ?? []).slice(0, 12)) ids.add(item.id);
  }
  const result: TvRelease[] = [];
  let successes = 0;
  // Concurrence bornée : une collection de cinquante séries ne doit pas partir
  // en cinquante requêtes simultanées.
  const queue = [...ids];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        const data = await request(`tv/${id}?append_to_response=watch/providers`, language);
        successes++;
        const base = { id, title: data.name, poster: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : undefined,
          // Ce que ces plateformes diffusent **aujourd'hui** en France, et non ce
          // qu'elles diffuseront : la saison annoncée n'y est promise nulle part.
          providers: (data['watch/providers']?.results?.FR?.flatrate ?? []).map((p: any) => p.provider_name) };
        const upcomingSeasons = (data.seasons ?? []).filter((s: any) => s.season_number > 0 && s.air_date >= today && s.air_date <= end);
        for (const season of upcomingSeasons) result.push({ ...base, date: season.air_date, season: season.season_number, kind: season.season_number === 1 ? 'new' : 'season' });
        const next = data.next_episode_to_air;
        if (next?.air_date >= today && next.air_date <= end && !upcomingSeasons.some((s: any) => s.season_number === next.season_number && s.air_date === next.air_date)) {
          result.push({ ...base, date: next.air_date, season: next.season_number, episode: next.episode_number, kind: 'episode' });
        }
      } catch {
        /* Une fiche manquante ne doit pas emporter les autres. */
      }
    }
  }));
  if (ids.size && !successes) throw new Error('TMDB unavailable');
  result.sort((a, b) => a.date.localeCompare(b.date));
  setCachedData(cacheKey, result);
  return result;
}
