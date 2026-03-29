import { createClient } from '@supabase/supabase-js';

// 🔑 Access environment variables safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// On initialise le client seulement si les clés sont présentes pour éviter les erreurs au build
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Types
export interface SharedSpace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  id: string;
  space_id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  is_active?: boolean;
  left_at?: string;
  last_active_at?: string; // Ajout
  profile?: {
    first_name: string;
    last_name?: string;
    bio?: string; // Ajout
    location?: string; // Ajout
    website?: string; // Ajout
    avatar_url?: string; // Ajout
  };
}

export interface SharedMovie {
  id: string;
  space_id: string;
  added_by?: string;
  tmdb_id?: number;
  title: string;
  director: string;
  year: number;
  genre: string;
  poster_url?: string;
  status: 'watched' | 'watchlist';
  added_at: string;
  added_by_profile?: {
    first_name: string;
  };
  media_type?: 'movie' | 'tv';
  number_of_seasons?: number;
  synopsis?: string;
  runtime?: number;
  genres?: string[];
  actors?: string;
  trailer_key?: string;
  tmdb_rating?: number;
}

export interface MovieRating {
  id: string;
  movie_id: string;
  profile_id: string;
  story: number;
  visuals: number;
  acting: number;
  sound: number;
  review?: string;
  rated_at: string;
  profile?: {
    first_name: string;
  };
}

export interface MovieVote {
  id: string;
  movie_id: string;
  profile_id: string;
  created_at: string;
}

// ===============================================
// FONCTIONS POUR LES ESPACES PARTAGÉS
// ===============================================

/**
 * Crée un nouvel espace partagé
 */
export async function createSharedSpace(
  name: string,
  description?: string,
  userId?: string
): Promise<SharedSpace | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('create_space_v2', {
    _name: name,
    _description: description || '',
  });

  if (error) {
    if (import.meta.env.DEV) console.error('Error creating space (RPC):', error);
    throw error;
  }

  return data as SharedSpace;
}

/**
 * Récupère tous les espaces d'un utilisateur (uniquement ceux où il est actif)
 */
export async function getUserSpaces(userId: string): Promise<SharedSpace[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shared_spaces')
    .select(
      `
      *,
      space_members!inner(profile_id)
    `
    )
    .eq('space_members.profile_id', userId)
    .eq('space_members.is_active', true); // Only fetch spaces where user is active

  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching spaces:', error);
    return [];
  }

  return data || [];
}

/**
 * Rejoindre un espace via code d'invitation
 */
export async function joinSpaceByCode(
  inviteCode: string,
  userId?: string
): Promise<{ success: boolean; space?: SharedSpace; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase non configuré' };

  try {
    const { data, error } = await supabase.rpc('join_space_by_code', {
      _invite_code: inviteCode,
    });

    if (error) throw error;
    return { success: true, space: data as SharedSpace };
  } catch (e: any) {
    if (import.meta.env.DEV) console.error('Error joining space:', e);
    return { success: false, error: e.message || 'Code invalide ou vous êtes déjà membre.' };
  }
}

/**
 * Quitter un espace partagé (Soft Delete)
 */
export async function leaveSharedSpace(spaceId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;

  // Soft delete: set is_active to false and record left_at timestamp
  const { error } = await supabase
    .from('space_members')
    .update({
      is_active: false,
      left_at: new Date().toISOString(),
    })
    .eq('space_id', spaceId)
    .eq('profile_id', userId);

  if (error) {
    if (import.meta.env.DEV) console.error('Error leaving space:', error);
    return false;
  }

  return true;
}

/**
 * Récupère tous les films d'un espace partagé
 */
export async function getSpaceMovies(spaceId: string): Promise<SharedMovie[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shared_movies')
    .select(
      `
      *,
      added_by_profile:profiles!added_by(first_name, last_name)
    `
    )
    .eq('space_id', spaceId)
    .order('added_at', { ascending: false });

  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching space movies:', error);
    return [];
  }

  return data || [];
}

/**
 * Ajoute un film à un espace partagé
 */
export async function addMovieToSpace(
  spaceId: string,
  movieData: {
    tmdb_id?: number;
    title: string;
    director: string;
    year: number;
    genre: string;
    poster_url?: string;
    status?: 'watched' | 'watchlist';
    media_type?: 'movie' | 'tv';
    number_of_seasons?: number;
    synopsis?: string;
    runtime?: number;
    genres?: string[];
    actors?: string;
    trailer_key?: string;
    tmdb_rating?: number;
  },
  userId: string
): Promise<SharedMovie | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('shared_movies')
    .insert({
      space_id: spaceId,
      added_by: userId,
      ...movieData,
    })
    .select()
    .single();

  if (error) {
    if (import.meta.env.DEV) console.error('Error adding movie to space:', error);
    return null;
  }

  return data;
}

/**
 * Supprimer un film d'un espace (uniquement par l'auteur ou admin de l'espace)
 */
export async function deleteSharedMovie(movieId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('shared_movies').delete().eq('id', movieId);
  return !error;
}

/**
 * Marquer un film de la watchlist comme "Regardé"
 */
export async function markMovieAsWatched(movieId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('shared_movies')
    .update({ status: 'watched', added_at: new Date().toISOString() })
    .eq('id', movieId);
  return !error;
}

/**
 * Gérer les votes "Je veux voir" sur la watchlist
 */
export async function toggleMovieVote(movieId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;

  // Vérifier si déjà voté
  const { data: existing } = await supabase
    .from('space_movie_votes')
    .select('id')
    .eq('movie_id', movieId)
    .eq('profile_id', userId)
    .single();

  if (existing) {
    // Unvote
    await supabase.from('space_movie_votes').delete().eq('id', existing.id);
  } else {
    // Vote
    await supabase.from('space_movie_votes').insert({ movie_id: movieId, profile_id: userId });
  }
  return true;
}

/**
 * Récupère tous les votes pour un film ou un espace
 */
export async function getSpaceMovieVotes(spaceId: string): Promise<MovieVote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('space_movie_votes')
    .select('*, shared_movies!inner(space_id)')
    .eq('shared_movies.space_id', spaceId);

  if (error) return [];
  return data || [];
}

/**
 * Récupère les notes d'un film
 */
export async function getMovieRatings(movieId: string): Promise<MovieRating[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('movie_ratings')
    .select(
      `
      *,
      profile:profiles(first_name, last_name)
    `
    )
    .eq('movie_id', movieId);

  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching ratings:', error);
    return [];
  }

  return data || [];
}

/**
 * Ajoute/Met à jour la note d'un utilisateur sur un film
 */
export async function upsertMovieRating(
  movieId: string,
  userId: string,
  ratings: {
    story: number;
    visuals: number;
    acting: number;
    sound: number;
    review?: string;
  }
): Promise<MovieRating | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('movie_ratings')
    .upsert({
      movie_id: movieId,
      profile_id: userId,
      ...ratings,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting rating:', error);
    return null;
  }

  return data;
}

/**
 * Récupère les membres actifs d'un espace avec leurs détails
 */
export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('space_members')
    .select(
      `
      *,
      profile:profiles(first_name, last_name, bio, location, website, avatar_url)
    `
    )
    .eq('space_id', spaceId)
    .eq('is_active', true); // Filter only active members

  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching members:', error);
    return [];
  }

  return data || [];
}

/**
 * Top 5 films les mieux notés par un membre dans un espace
 */
export async function getMemberTopFilms(
  profileId: string,
  spaceId: string,
  limit = 5
): Promise<{ id: string; title: string; poster_url?: string; year: number; avg_rating: number }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('movie_ratings')
    .select('movie_id, story, visuals, acting, sound, shared_movies!inner(id, title, poster_url, year, space_id)')
    .eq('profile_id', profileId)
    .eq('shared_movies.space_id', spaceId);
  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching member top films:', error);
    return [];
  }
  return (data || [])
    .map((r: any) => ({
      id: r.shared_movies.id,
      title: r.shared_movies.title,
      poster_url: r.shared_movies.poster_url,
      year: r.shared_movies.year,
      avg_rating: Math.round(((r.story + r.visuals + r.acting + r.sound) / 4) * 10) / 10,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating)
    .slice(0, limit);
}

/**
 * Stats d'un membre dans un espace (films notés + moyenne)
 */
export async function getMemberStats(
  profileId: string,
  spaceId: string
): Promise<{ watchedCount: number; avgRating: number }> {
  if (!supabase) return { watchedCount: 0, avgRating: 0 };
  const { data, error } = await supabase
    .from('movie_ratings')
    .select('story, visuals, acting, sound, shared_movies!inner(space_id)')
    .eq('profile_id', profileId)
    .eq('shared_movies.space_id', spaceId);
  if (error || !data || data.length === 0) return { watchedCount: 0, avgRating: 0 };
  const watchedCount = data.length;
  const avgRating =
    Math.round(
      (data.reduce((sum: number, r: any) => sum + (r.story + r.visuals + r.acting + r.sound) / 4, 0) /
        watchedCount) *
        10
    ) / 10;
  return { watchedCount, avgRating };
}

// ===============================================
// REAL-TIME SUBSCRIPTIONS
// ===============================================

/**
 * S'abonner aux changements d'un espace en temps réel
 */
export function subscribeToSpace(
  spaceId: string,
  onMovieChange: (payload: any) => void,
  onRatingChange: (payload: any) => void
) {
  if (!supabase) return () => {};

  const moviesChannel = supabase
    .channel(`space-movies-${spaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_movies',
        filter: `space_id=eq.${spaceId}`,
      },
      onMovieChange
    )
    .subscribe();

  const ratingsChannel = supabase
    .channel(`space-ratings-${spaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'movie_ratings',
      },
      onRatingChange
    )
    .subscribe();

  const votesChannel = supabase
    .channel(`space-votes-${spaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'space_movie_votes',
      },
      onRatingChange // Re-use rating callback for general refresh
    )
    .subscribe();

  return () => {
    supabase?.removeChannel(moviesChannel);
    supabase?.removeChannel(ratingsChannel);
    supabase?.removeChannel(votesChannel);
  };
}
