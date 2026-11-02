import { getSpaceMembers, getSpaceMovies, getSpaceRatings, getUserSpaces } from './supabase';
import { ratingValue } from '../utils/verdict';
import type { RatingEntry } from '../utils/affinities';

/** Au-delà, le calcul attend trop : les espaces les plus récents suffisent. */
const MAX_SPACES = 12;

/** Un espace actif, pour les stories de l'onglet Amis. */
export interface SpaceStory {
  id: string;
  name: string;
  /** L'affiche du dernier film ajouté. */
  posterUrl?: string;
  members: number;
  /** La dernière note d'un autre membre, et la tienne sur le même film. */
  latest?: { name: string; title: string; posterUrl?: string; value: number; mine?: number; at: number; missing: number };
  lastActivity: number;
}

/**
 * Toutes les notes de tes espaces, mises à plat pour `computeAffinities`, et
 * tes espaces actifs (au moins deux membres) pour les stories. Renvoie aussi le
 * nombre d'espaces : sans espace, l'onglet invite à en rejoindre.
 */
export async function loadAffinityEntries(
  userId: string
): Promise<{ spaces: number; entries: RatingEntry[]; stories: SpaceStory[] }> {
  const { data: spaces } = await getUserSpaces(userId);
  const list = spaces.slice(0, MAX_SPACES);
  const parts = await Promise.all(
    list.map(async (space) => {
      const [{ data: movies }, { data: ratings }, { data: members }] = await Promise.all([
        getSpaceMovies(space.id),
        getSpaceRatings(space.id),
        getSpaceMembers(space.id),
      ]);
      const byId = new Map(movies.map((m) => [m.id, m]));
      const profileOf = (r: unknown) => (r as { profile?: { first_name?: string; avatar_url?: string | null } }).profile;
      const entries = ratings.flatMap((r): RatingEntry[] => {
        const movie = byId.get(r.movie_id);
        if (!movie) return [];
        return [
          {
            key: movie.tmdb_id ? `tmdb:${movie.tmdb_id}` : `${movie.title.toLowerCase()}|${movie.year}`,
            title: movie.title,
            posterUrl: movie.poster_url,
            spaceId: space.id,
            spaceName: space.name,
            personId: r.profile_id,
            name: profileOf(r)?.first_name || '?',
            avatarUrl: profileOf(r)?.avatar_url ?? null,
            value: ratingValue(r),
          },
        ];
      });
      // La dernière note d'un autre : le fil de la story.
      const others = ratings
        .filter((r) => r.profile_id !== userId && byId.has(r.movie_id) && r.rated_at)
        .sort((a, b) => Date.parse(b.rated_at) - Date.parse(a.rated_at));
      const last = others[0];
      const lastMovie = last ? byId.get(last.movie_id) : undefined;
      const mine = last ? ratings.find((r) => r.movie_id === last.movie_id && r.profile_id === userId) : undefined;
      const ratedIt = last ? new Set(ratings.filter((r) => r.movie_id === last.movie_id).map((r) => r.profile_id)).size : 0;
      const newest = [...movies].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))[0];
      const story: SpaceStory = {
        id: space.id,
        name: space.name,
        posterUrl: lastMovie?.poster_url ?? newest?.poster_url,
        members: members.length,
        latest:
          last && lastMovie
            ? {
                name: profileOf(last)?.first_name || '?',
                title: lastMovie.title,
                posterUrl: lastMovie.poster_url,
                value: ratingValue(last),
                mine: mine ? ratingValue(mine) : undefined,
                at: Date.parse(last.rated_at),
                missing: Math.max(0, members.length - ratedIt),
              }
            : undefined,
        lastActivity: Math.max(last ? Date.parse(last.rated_at) : 0, newest ? Date.parse(newest.added_at) : 0),
      };
      return { entries, story };
    })
  );
  return {
    spaces: spaces.length,
    entries: parts.flatMap((p) => p.entries),
    stories: parts.map((p) => p.story).filter((s) => s.members >= 2).sort((a, b) => b.lastActivity - a.lastActivity),
  };
}
