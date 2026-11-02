import { getSpaceMovies, getSpaceRatings, getUserSpaces } from './supabase';
import { ratingValue } from '../utils/verdict';
import type { RatingEntry } from '../utils/affinities';

/** Au-delà, le calcul attend trop : les espaces les plus récents suffisent. */
const MAX_SPACES = 12;

/**
 * Toutes les notes de tes espaces, mises à plat pour `computeAffinities`.
 * Renvoie aussi le nombre d'espaces : sans espace, l'onglet invite à en rejoindre.
 */
export async function loadAffinityEntries(userId: string): Promise<{ spaces: number; entries: RatingEntry[] }> {
  const { data: spaces } = await getUserSpaces(userId);
  const list = spaces.slice(0, MAX_SPACES);
  const parts = await Promise.all(
    list.map(async (space) => {
      const [{ data: movies }, { data: ratings }] = await Promise.all([getSpaceMovies(space.id), getSpaceRatings(space.id)]);
      const byId = new Map(movies.map((m) => [m.id, m]));
      return ratings.flatMap((r): RatingEntry[] => {
        const movie = byId.get(r.movie_id);
        if (!movie) return [];
        const profile = (r as unknown as { profile?: { first_name?: string; avatar_url?: string | null } }).profile;
        return [
          {
            key: movie.tmdb_id ? `tmdb:${movie.tmdb_id}` : `${movie.title.toLowerCase()}|${movie.year}`,
            title: movie.title,
            posterUrl: movie.poster_url,
            spaceName: space.name,
            personId: r.profile_id,
            name: profile?.first_name || '?',
            avatarUrl: profile?.avatar_url ?? null,
            value: ratingValue(r),
          },
        ];
      });
    })
  );
  return { spaces: spaces.length, entries: parts.flat() };
}
