/**
 * Ce que mes espaces disent d'un film que j'ai noté : la note de chaque membre et
 * la moyenne du groupe, espace par espace.
 *
 * Une seule lecture. Les relations sont nommées (`!…_fkey`) : `notifications` et
 * `watch_plans` relient elles aussi les films aux espaces, et `review_reactions`
 * les notes aux personnes ; sans le nom, PostgREST refuse l'embed (PGRST201).
 */
import { supabase } from './supabase';
import { ratingValue } from '../utils/verdict';

export interface SpaceNote {
  spaceId: string;
  spaceName: string;
  sharedMovieId: string;
  /** Les autres membres qui l'ont noté dans cet espace. */
  others: { name: string; value: number }[];
  /** Moyenne de toutes les notes de l'espace, la mienne comprise. */
  average: number;
  count: number;
}

export async function getSpaceNotes(tmdbId: number, mediaType: 'movie' | 'tv', userId: string): Promise<SpaceNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('movie_ratings')
    .select(
      'profile_id, story, visuals, acting, sound, adaptive_rating, ' +
        'profile:profiles!movie_ratings_profile_id_fkey(first_name), ' +
        'shared_movies!inner(id, tmdb_id, media_type, season_number, space_id, shared_spaces!shared_movies_space_id_fkey(name))'
    )
    .eq('shared_movies.tmdb_id', tmdbId)
    .is('shared_movies.season_number', null);
  if (error || !data) {
    if (error) console.warn('[Ma note] Notes des espaces :', error.message);
    return [];
  }
  const bySpace = new Map<string, SpaceNote & { values: number[] }>();
  for (const row of data as any[]) {
    const movie = row.shared_movies;
    if (!movie || (movie.media_type ?? 'movie') !== mediaType) continue;
    const value = ratingValue(row);
    const entry =
      bySpace.get(movie.space_id) ??
      ({ spaceId: movie.space_id, spaceName: movie.shared_spaces?.name ?? '', sharedMovieId: movie.id, others: [], average: 0, count: 0, values: [] } as SpaceNote & {
        values: number[];
      });
    entry.values.push(value);
    if (row.profile_id !== userId) entry.others.push({ name: row.profile?.first_name ?? '', value });
    bySpace.set(movie.space_id, entry);
  }
  return [...bySpace.values()]
    .filter((s) => s.others.length > 0)
    .map(({ values, ...s }) => ({ ...s, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length }));
}
