/**
 * Films en commun (migration 20261127120000_films_en_commun.sql).
 *
 * - À l'arrivée dans un espace : les films que tu as notés et qu'un autre
 *   membre a notés aussi, qu'on propose d'ajouter d'un geste. L'ajout se fait
 *   côté serveur, sans notifier personne film par film.
 * - Sur les cartes de la collection : la note des membres de tes espaces pour
 *   un film vu des deux côtés.
 *
 * Tant que la migration n'est pas posée, les appels échouent en silence : rien
 * ne s'affiche, rien ne casse.
 */
import { supabase } from './supabase';
import { wishKey } from './social';

export interface CommonFilmsPreview {
  count: number;
  /** Prénoms des membres avec qui tu as des films en commun. */
  names: string[];
  /** Jusqu'à trois affiches, les plus récentes. */
  posters: string[];
}

export async function commonFilmsPreview(spaceId: string): Promise<CommonFilmsPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('common_films_preview', { p_space: spaceId });
  if (error || !data) return null;
  const raw = data as Partial<CommonFilmsPreview>;
  return {
    count: Number(raw.count) || 0,
    names: Array.isArray(raw.names) ? raw.names.filter((n): n is string => typeof n === 'string') : [],
    posters: Array.isArray(raw.posters) ? raw.posters.filter((p): p is string => typeof p === 'string') : [],
  };
}

export async function addCommonFilms(spaceId: string): Promise<{ added: number } | { error: string }> {
  if (!supabase) return { error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('add_common_films', { p_space: spaceId });
  if (error) return { error: error.message || 'L’ajout n’a pas abouti. Réessaie dans un instant.' };
  return { added: Number(data) || 0 };
}

/**
 * La question ne revient pas à chaque visite : on retient le nombre de membres
 * au moment de la réponse, et on ne la repose que si quelqu'un est arrivé depuis.
 */
const askedKey = (spaceId: string, userId: string) => `bitter_common_films_${spaceId}_${userId}`;

export function commonFilmsAsked(spaceId: string, userId: string, members: number): boolean {
  try {
    const raw = localStorage.getItem(askedKey(spaceId, userId));
    if (!raw) return false;
    const seen = Number((JSON.parse(raw) as { members?: unknown }).members);
    return Number.isFinite(seen) && members <= seen;
  } catch {
    return false;
  }
}

export function markCommonFilmsAsked(spaceId: string, userId: string, members: number): void {
  try {
    localStorage.setItem(askedKey(spaceId, userId), JSON.stringify({ members, at: Date.now() }));
  } catch {
    // Stockage indisponible : la question pourra revenir, sans plus.
  }
}

export interface CommonRating {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  profile_id: string;
  first_name: string;
  avatar_url: string | null;
  rating: number;
}

/** Pour chaque film vu de ta collection (clé `wishKey`), les notes des membres de tes espaces. */
export async function getCommonRatings(): Promise<Map<string, CommonRating[]>> {
  const map = new Map<string, CommonRating[]>();
  if (!supabase) return map;
  const { data, error } = await supabase.rpc('get_common_ratings');
  if (error) {
    console.warn('[Espaces] Notes des proches illisibles', error.message);
    return map;
  }
  for (const row of (data || []) as CommonRating[]) {
    const rating = Number(row.rating);
    if (!Number.isFinite(rating) || rating <= 0) continue;
    const key = wishKey(row.media_type, row.tmdb_id);
    map.set(key, [...(map.get(key) ?? []), { ...row, rating }]);
  }
  return map;
}
