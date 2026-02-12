
import { createClient } from '@supabase/supabase-js';

// 🔑 Access environment variables safely
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

// On initialise le client seulement si les clés sont présentes pour éviter les erreurs au build
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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
  profile?: {
    first_name: string;
    last_name?: string;
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
    _description: description || ''
  });

  if (error) {
    console.error('Error creating space (RPC):', error);
    throw error;
  }

  return data as SharedSpace;
}

/**
 * Récupère tous les espaces d'un utilisateur
 */
export async function getUserSpaces(userId: string): Promise<SharedSpace[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shared_spaces')
    .select(`
      *,
      space_members!inner(profile_id)
    `)
    .eq('space_members.profile_id', userId);

  if (error) {
    console.error('Error fetching spaces:', error);
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
      _invite_code: inviteCode
    });

    if (error) throw error;
    return { success: true, space: data as SharedSpace };
  } catch (e: any) {
    console.error('Error joining space:', e);
    return { success: false, error: e.message || "Code invalide ou vous êtes déjà membre." };
  }
}

/**
 * Quitter un espace partagé
 */
export async function leaveSharedSpace(spaceId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  const { error } = await supabase
    .from('space_members')
    .delete()
    .eq('space_id', spaceId)
    .eq('profile_id', userId);

  if (error) {
    console.error('Error leaving space:', error);
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
    .select(`
      *,
      added_by_profile:profiles!added_by(first_name, last_name)
    `)
    .eq('space_id', spaceId)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('Error fetching space movies:', error);
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
  },
  userId: string
): Promise<SharedMovie | null> {
  if (!supabase) return null;

  // --- DEBUG LOGS START ---
  try {
    console.log("DEBUG: about to add movie");
    console.log("DEBUG: space_id (a) =", spaceId);
    console.log("DEBUG: added_by (i) =", userId);
    console.log("DEBUG: movie object (e) =", movieData);
    
    // Supabase v2 uses getSession, v1 uses user()
    if (supabase.auth && typeof (supabase.auth as any).getSession === 'function') {
      (supabase.auth as any).getSession().then(({ data }: any) => {
        console.log("DEBUG: Supabase Session =", data.session);
        console.log("DEBUG: Session User ID =", data.session?.user?.id);
      }).catch((err: any) => console.error("DEBUG: error getting session", err));
    } else if (supabase.auth && (supabase.auth as any).user) {
      const user = (supabase.auth as any).user();
      console.log("DEBUG: Supabase User =", user);
      console.log("DEBUG: User ID =", user?.id);
    }
  } catch (err) {
    console.error("DEBUG: error in logging", err);
  }
  // --- DEBUG LOGS END ---

  const { data, error } = await supabase
    .from('shared_movies')
    .insert({
      space_id: spaceId,
      added_by: userId,
      ...movieData
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding movie to space:', error);
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
    .select(`
      *,
      profile:profiles(first_name, last_name)
    `)
    .eq('movie_id', movieId);

  if (error) {
    console.error('Error fetching ratings:', error);
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
      updated_at: new Date().toISOString()
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
 * Récupère les membres d'un espace
 */
export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('space_members')
    .select(`
      *,
      profile:profiles(first_name, last_name)
    `)
    .eq('space_id', spaceId);

  if (error) {
    console.error('Error fetching members:', error);
    return [];
  }

  return data || [];
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
        filter: `space_id=eq.${spaceId}`
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
        table: 'movie_ratings'
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
        table: 'space_movie_votes'
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
