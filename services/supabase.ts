
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
}

// ===============================================
// FONCTIONS POUR LES ESPACES PARTAGÉS
// ===============================================

/**
 * Crée un nouvel espace partagé (Version Blindée RLS)
 */
export async function createSharedSpace(
  name: string,
  description?: string,
  userId?: string
): Promise<SharedSpace | null> {
  if (!supabase) return null;

  // 1. Sécurité : Si l'ID n'est pas passé en argument, on le récupère via Auth
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    finalUserId = user?.id;
  }

  // Si toujours pas d'ID, stop.
  if (!finalUserId) {
    console.error("🚨 Création impossible : Utilisateur non connecté.");
    throw new Error("User must be logged in to create a space");
  }

  // 2. Insert avec l'ID garanti
  const { data, error } = await supabase
    .from('shared_spaces')
    .insert({
      name,
      description,
      created_by: finalUserId
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating space:', error);
    throw error;
  }

  // 3. Auto-join du créateur
  if (data) {
    const { error: memberError } = await supabase.from('space_members').insert({
      space_id: data.id,
      profile_id: finalUserId,
      role: 'owner'
    });
    
    if (memberError) console.error('Error adding owner:', memberError);
  }

  return data;
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
  userId: string
): Promise<{ success: boolean; space?: SharedSpace; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase non configuré' };

  // Vérifier que l'espace existe
  const { data: space, error: spaceError } = await supabase
    .from('shared_spaces')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (spaceError || !space) {
    return { success: false, error: 'Code invalide' };
  }

  // Vérifier que l'utilisateur n'est pas déjà membre
  const { data: existing } = await supabase
    .from('space_members')
    .select('id')
    .eq('space_id', space.id)
    .eq('profile_id', userId)
    .single();

  if (existing) {
    return { success: false, error: 'Vous êtes déjà membre' };
  }

  // Ajouter l'utilisateur comme membre
  const { error: memberError } = await supabase
    .from('space_members')
    .insert({
      space_id: space.id,
      profile_id: userId,
      role: 'member'
    });

  if (memberError) {
    console.error('Error joining space:', memberError);
    return { success: false, error: 'Erreur lors de l\'ajout' };
  }

  return { success: true, space };
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

  // Subscription aux films
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

  // Subscription aux notes
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

  // Fonction de cleanup
  return () => {
    supabase?.removeChannel(moviesChannel);
    supabase?.removeChannel(ratingsChannel);
  };
}
