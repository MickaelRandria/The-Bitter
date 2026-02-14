import { supabase } from './supabase';
import { Movie } from '../types';

const MIGRATION_KEY = 'the_bitter_migration_done';

// ============================================
// HELPERS : Conversion Movie ↔ DB Row
// ============================================

const movieToRow = (movie: Movie, profileId: string) => ({
  id: movie.id,
  profile_id: profileId,
  tmdb_id: movie.tmdbId || null,
  media_type: movie.mediaType || 'movie',
  title: movie.title,
  director: movie.director || '',
  director_id: movie.directorId || null,
  actors: movie.actors || '',
  actor_ids: movie.actorIds || null,
  year: movie.year,
  release_date: movie.releaseDate || null,
  runtime: movie.runtime || null,
  genre: movie.genre || '',
  poster_url: movie.posterUrl || null,
  tmdb_rating: movie.tmdbRating || null,
  number_of_seasons: movie.numberOfSeasons || null,
  status: movie.status || 'watched',
  date_added: new Date(movie.dateAdded).toISOString(),
  date_watched: movie.dateWatched ? new Date(movie.dateWatched).toISOString() : null,
  rating_story: movie.ratings?.story ?? 0,
  rating_visuals: movie.ratings?.visuals ?? 0,
  rating_acting: movie.ratings?.acting ?? 0,
  rating_sound: movie.ratings?.sound ?? 0,
  vibe_story: movie.vibe?.story ?? null,
  vibe_emotion: movie.vibe?.emotion ?? null,
  vibe_fun: movie.vibe?.fun ?? null,
  vibe_visual: movie.vibe?.visual ?? null,
  vibe_tension: movie.vibe?.tension ?? null,
  quality_scenario: movie.qualityMetrics?.scenario ?? null,
  quality_acting: movie.qualityMetrics?.acting ?? null,
  quality_visual: movie.qualityMetrics?.visual ?? null,
  quality_sound: movie.qualityMetrics?.sound ?? null,
  review: movie.review || '',
  comment: movie.comment || null,
  theme: movie.theme || 'black',
  smartphone_factor: movie.smartphoneFactor ?? 0,
  hype: movie.hype ?? null,
  pacing: movie.pacing || null,
  rewatch: movie.rewatch || false,
  tags: movie.tags || null,
  symptoms: movie.symptoms || null,
});

const rowToMovie = (row: any): Movie => ({
  id: row.id,
  tmdbId: row.tmdb_id,
  mediaType: row.media_type || 'movie',
  title: row.title,
  director: row.director || '',
  directorId: row.director_id,
  actors: row.actors || '',
  actorIds: row.actor_ids,
  year: row.year,
  releaseDate: row.release_date,
  runtime: row.runtime,
  genre: row.genre || '',
  posterUrl: row.poster_url,
  tmdbRating: row.tmdb_rating,
  numberOfSeasons: row.number_of_seasons,
  status: row.status || 'watched',
  dateAdded: new Date(row.date_added).getTime(),
  dateWatched: row.date_watched ? new Date(row.date_watched).getTime() : undefined,
  ratings: {
    story: row.rating_story ?? 0,
    visuals: row.rating_visuals ?? 0,
    acting: row.rating_acting ?? 0,
    sound: row.rating_sound ?? 0,
  },
  vibe: (row.vibe_story != null || row.vibe_emotion != null) ? {
    story: row.vibe_story ?? 5,
    emotion: row.vibe_emotion ?? 5,
    fun: row.vibe_fun ?? 5,
    visual: row.vibe_visual ?? 5,
    tension: row.vibe_tension ?? 5,
  } : undefined,
  qualityMetrics: (row.quality_scenario != null || row.quality_acting != null) ? {
    scenario: row.quality_scenario ?? 5,
    acting: row.quality_acting ?? 5,
    visual: row.quality_visual ?? 5,
    sound: row.quality_sound ?? 5,
  } : undefined,
  review: row.review || '',
  comment: row.comment,
  theme: row.theme || 'black',
  smartphoneFactor: row.smartphone_factor ?? 0,
  hype: row.hype,
  pacing: row.pacing,
  rewatch: row.rewatch || false,
  tags: row.tags,
  symptoms: row.symptoms,
});

// ============================================
// FONCTIONS CRUD
// ============================================

export const fetchMoviesFromSupabase = async (profileId: string): Promise<Movie[] | null> => {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('profile_id', profileId)
    .order('date_added', { ascending: false });

  if (error) {
    console.error('❌ Erreur chargement films Supabase:', error.message);
    return null;
  }
  
  return (data || []).map(rowToMovie);
};

export const saveMovieToSupabase = async (movie: Movie, profileId: string): Promise<boolean> => {
  if (!supabase) return false;
  
  const row = movieToRow(movie, profileId);
  const { error } = await supabase
    .from('user_movies')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('❌ Erreur sauvegarde film Supabase:', error.message);
    return false;
  }
  
  return true;
};

export const deleteMovieFromSupabase = async (movieId: string): Promise<boolean> => {
  if (!supabase) return false;
  
  const { error } = await supabase
    .from('user_movies')
    .delete()
    .eq('id', movieId);

  if (error) {
    console.error('❌ Erreur suppression film Supabase:', error.message);
    return false;
  }
  
  return true;
};

// ============================================
// MIGRATION ONE-SHOT : localStorage → Supabase
// ============================================

export const migrateLocalToSupabase = async (
  profileId: string,
  localMovies: Movie[]
): Promise<number> => {
  if (!supabase) return 0;

  // Vérifier si déjà migré
  const migrationKey = `${MIGRATION_KEY}_${profileId}`;
  if (localStorage.getItem(migrationKey) === 'true') {
    return 0;
  }

  if (localMovies.length === 0) {
    localStorage.setItem(migrationKey, 'true');
    return 0;
  }

  console.log(`🔄 Migration de ${localMovies.length} films vers Supabase...`);
  
  const rows = localMovies.map(m => movieToRow(m, profileId));
  
  const { error } = await supabase
    .from('user_movies')
    .upsert(rows, { 
      onConflict: 'id',
      ignoreDuplicates: true 
    });

  if (error) {
    console.error('❌ Erreur migration:', error.message);
    return 0;
  }

  localStorage.setItem(migrationKey, 'true');
  console.log(`✅ Migration réussie : ${localMovies.length} films`);
  return localMovies.length;
};

export const syncMovies = async (
  profileId: string,
  localMovies: Movie[]
): Promise<Movie[]> => {
  if (!supabase) return localMovies;

  // 1. Migration si pas encore faite
  const migrationKey = `${MIGRATION_KEY}_${profileId}`;
  if (localStorage.getItem(migrationKey) !== 'true') {
    await migrateLocalToSupabase(profileId, localMovies);
  }

  // 2. Charger depuis Supabase (source de vérité)
  const supabaseMovies = await fetchMoviesFromSupabase(profileId);
  
  if (supabaseMovies === null) {
    console.warn('⚠️ Impossible de charger depuis Supabase, utilisation du cache local');
    return localMovies;
  }
  
  return supabaseMovies;
};