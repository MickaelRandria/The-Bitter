import { supabase } from './supabase';
import { UserProfile, Movie } from '../types';

const PROFILES_STORAGE_KEY = 'the_bitter_profiles_v2';

function movieToRow(movie: Movie, userId: string) {
  return {
    profile_id: userId,
    tmdb_id: movie.tmdbId ?? null,
    title: movie.title,
    director: movie.director,
    director_id: movie.directorId ?? null,
    actors: movie.actors || null,
    actor_ids: movie.actorIds ? JSON.stringify(movie.actorIds) : null,
    year: movie.year,
    release_date: movie.releaseDate ?? null,
    runtime: movie.runtime ?? null,
    genre: movie.genre,
    poster_url: movie.posterUrl ?? null,
    tmdb_rating: movie.tmdbRating ?? null,
    status: movie.status,
    date_watched: movie.dateWatched ? new Date(movie.dateWatched).toISOString() : null,
    theme: movie.theme ?? null,
    tags: movie.tags ?? null,
    media_type: movie.mediaType ?? 'movie',
    story: movie.ratings?.story ?? null,
    visuals: movie.ratings?.visuals ?? null,
    acting: movie.ratings?.acting ?? null,
    sound: movie.ratings?.sound ?? null,
    vibe_story: movie.vibe?.story ?? null,
    vibe_emotion: movie.vibe?.emotion ?? null,
    vibe_fun: movie.vibe?.fun ?? null,
    vibe_visual: movie.vibe?.visual ?? null,
    vibe_tension: movie.vibe?.tension ?? null,
    smartphone_factor: movie.smartphoneFactor ?? null,
    hype: movie.hype ?? null,
    review: movie.review || null,
    severity_index: null,
    patience_level: null,
    created_at: movie.dateAdded ? new Date(movie.dateAdded).toISOString() : new Date().toISOString(),
    rated_at: movie.dateWatched ? new Date(movie.dateWatched).toISOString() : null,
  };
}

export async function migrateLocalStorageToSupabase(userId: string): Promise<{
  success: boolean;
  count?: number;
  alreadyMigrated?: boolean;
  backupKey?: string;
  error?: string;
}> {
  try {
    const migrationKey = `migration_completed_${userId}`;
    if (localStorage.getItem(migrationKey) === 'true') {
      return { success: true, alreadyMigrated: true, count: 0 };
    }

    // Trouver le profil correspondant à ce userId Supabase
    const profilesRaw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!profilesRaw) {
      localStorage.setItem(migrationKey, 'true');
      return { success: true, count: 0 };
    }

    const profiles: UserProfile[] = JSON.parse(profilesRaw);
    // Prendre le profil avec le plus de films (le profil principal)
    const profile = profiles.reduce((best, p) =>
      p.movies.length > best.movies.length ? p : best,
      profiles[0]
    );

    if (!profile || profile.movies.length === 0) {
      localStorage.setItem(migrationKey, 'true');
      return { success: true, count: 0 };
    }

    const movies = profile.movies;

    // Backup
    const backupKey = `backup_movies_${userId}`;
    localStorage.setItem(
      backupKey,
      JSON.stringify({ userId, date: new Date().toISOString(), count: movies.length, movies })
    );

    // Préparer les lignes — films sans tmdb_id en batch séparé (pas de contrainte UNIQUE)
    const withTmdbId = movies.filter((m) => m.tmdbId);
    const withoutTmdbId = movies.filter((m) => !m.tmdbId);

    if (!supabase) throw new Error('Supabase non initialisé');

    // Upsert films avec tmdb_id
    if (withTmdbId.length > 0) {
      const { error } = await supabase
        .from('user_movies')
        .upsert(withTmdbId.map((m) => movieToRow(m, userId)), {
          onConflict: 'profile_id,tmdb_id',
          ignoreDuplicates: false,
        });
      if (error) throw error;
    }

    // Insert films sans tmdb_id (pas de upsert possible, on insère naïvement)
    if (withoutTmdbId.length > 0) {
      const { error } = await supabase
        .from('user_movies')
        .insert(withoutTmdbId.map((m) => movieToRow(m, userId)));
      if (error) throw error;
    }

    localStorage.setItem(migrationKey, 'true');

    return { success: true, count: movies.length, backupKey };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function restoreFromBackup(userId: string): Promise<boolean> {
  try {
    const backupKey = `backup_movies_${userId}`;
    const backupRaw = localStorage.getItem(backupKey);
    if (!backupRaw) {
      alert('❌ Aucun backup trouvé');
      return false;
    }
    const backup = JSON.parse(backupRaw);
    const confirmed = window.confirm(
      `Restaurer ${backup.count} films depuis le backup du ${new Date(backup.date).toLocaleString()} ?`
    );
    if (!confirmed) return false;

    // Remettre les films dans le profil principal
    const profilesRaw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (profilesRaw) {
      const profiles: UserProfile[] = JSON.parse(profilesRaw);
      if (profiles.length > 0) {
        profiles[0].movies = backup.movies;
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
      }
    }

    localStorage.removeItem(`migration_completed_${userId}`);
    alert(`✅ ${backup.count} films restaurés !`);
    window.location.reload();
    return true;
  } catch {
    alert('❌ Erreur lors de la restauration');
    return false;
  }
}
