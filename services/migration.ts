import { supabase } from './supabase';
import { CinemaSubscription, UserProfile, Movie } from '../types';

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
    // `review` porte le synopsis TMDB, pré-rempli à la sélection du film. L'avis
    // écrit par la personne est dans `comment`, et il n'était jamais envoyé : le
    // fil ne pouvait donc afficher qu'un résumé là où l'on attend une opinion.
    comment: movie.comment || null,
    // severity_index et patience_level étaient envoyés en dur à null : chaque
    // upsert écrasait donc en base des valeurs que l'application ne connaît même
    // pas à ce niveau. On ne touche plus à ces colonnes.
    adaptive_rating: movie.adaptiveRating ?? null,
    // Absent du modèle local des anciens films : on publie par défaut, ce qui
    // correspond au réglage choisi et à ce que la colonne vaut déjà en base.
    shared_to_feed: movie.shareToFeed !== false,
    // Le tableau conserve chaque séance (rewatches inclus) et son contexte.
    // Le champ JSONB est ajouté par la migration abonnement cinéma.
    watches: movie.watches ?? null,
    // created_at doit être DÉTERMINISTE et TOUJOURS présent.
    //
    // Déterministe : `new Date()` en repli réécrivait la date de création à chaque
    // resynchronisation. On dérive donc la valeur des seules données du film.
    //
    // Toujours présent : rendre la clé conditionnelle produit, dans un upsert
    // groupé, des objets aux clés différentes, ce que PostgREST rejette en bloc
    // (PGRST102). Un seul film sans dateAdded ferait échouer tout le lot.
    //
    // `dateAdded` est requis par le type Movie et posé à la création : le repli
    // n'est là que pour garantir l'uniformité des clés.
    created_at: new Date(movie.dateAdded || movie.dateWatched || 0).toISOString(),
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

export async function resyncAllMoviesToSupabase(userId: string, linkedProfileId?: string): Promise<number> {
  if (!supabase) { console.warn('[Resync] supabase not initialized'); return 0; }
  const profilesRaw = localStorage.getItem(PROFILES_STORAGE_KEY);
  if (!profilesRaw) { console.warn('[Resync] no profiles in localStorage'); return 0; }
  const profiles: UserProfile[] = JSON.parse(profilesRaw);
  console.log(`[Resync] ${profiles.length} profil(s) trouvé(s) en localStorage, linkedProfileId=${linkedProfileId}`);
  const profile = linkedProfileId
    ? (profiles.find((p) => p.id === linkedProfileId) ?? profiles.reduce((best, p) => (p.movies.length > best.movies.length ? p : best), profiles[0]))
    : profiles.reduce((best, p) => (p.movies.length > best.movies.length ? p : best), profiles[0]);
  if (!profile) { console.warn('[Resync] aucun profil trouvé'); return 0; }
  console.log(`[Resync] profil sélectionné: ${profile.firstName}, ${profile.movies.length} film(s) total`);
  // Ce chemin n'envoie pas `deleted_at` : une ligne déjà marquée supprimée voit
  // ses autres colonnes rafraîchies mais reste supprimée. Pour un rattrapage avec
  // rapport ET filtrage explicite des suppressions, utiliser plutôt
  // `backfillProfileToSupabase` de services/movieSync.ts.
  const withTmdbId = profile.movies.filter((m) => m.tmdbId != null);
  console.log(`[Resync] ${withTmdbId.length} film(s) avec tmdbId à upserter`);
  if (withTmdbId.length === 0) return 0;
  const { error } = await supabase
    .from('user_movies')
    .upsert(withTmdbId.map((m) => movieToRow(m, userId)), { onConflict: 'profile_id,tmdb_id', ignoreDuplicates: false });
  if (error) { console.error('[Resync] erreur upsert:', error); return 0; }
  console.log(`[Resync] ✓ ${withTmdbId.length} film(s) synchronisés pour userId=${userId}`);
  return withTmdbId.length;
}

/**
 * Ajout ou modification délibérée d'un film par l'utilisateur.
 *
 * `deleted_at: null` est posé explicitement : réajouter un film précédemment
 * supprimé est une vraie décision, elle doit lever la pierre tombale. C'est
 * exactement l'inverse du backfill (voir `backfillProfileToSupabase`), qui lui
 * respecte les suppressions faites depuis un autre appareil. Les deux chemins
 * restent volontairement séparés : ils n'ont pas le même sens.
 */
export async function syncMovieToSupabase(userId: string, movie: Movie): Promise<void> {
  if (!supabase || !movie.tmdbId) return;
  await supabase
    .from('user_movies')
    .upsert(
      { ...movieToRow(movie, userId), deleted_at: null },
      { onConflict: 'profile_id,tmdb_id', ignoreDuplicates: false }
    );
}

/**
 * Synchronise un groupe de films déjà calculé en mémoire.
 *
 * Contrairement à `resyncAllMoviesToSupabase`, cette fonction ne relit pas
 * localStorage : elle peut donc être appelée juste après un import historique
 * ou un rewatch, avant que l'effet React de persistance ait eu le temps d'écrire.
 */
export async function syncMoviesToSupabase(userId: string, movies: Movie[]): Promise<void> {
  if (!supabase) return;
  const withTmdbId = movies.filter((movie) => movie.tmdbId != null);
  if (withTmdbId.length === 0) return;

  // Même sémantique que syncMovieToSupabase : ce sont des modifications voulues,
  // elles lèvent une éventuelle suppression antérieure.
  const { error } = await supabase
    .from('user_movies')
    .upsert(
      withTmdbId.map((movie) => ({ ...movieToRow(movie, userId), deleted_at: null })),
      { onConflict: 'profile_id,tmdb_id', ignoreDuplicates: false }
    );

  if (error && import.meta.env.DEV) {
    console.error('[Cinema subscription] Unable to sync movie sessions:', error);
  }
}

/** Persiste la configuration dans le profil Supabase sans introduire de table parallèle. */
export async function syncCinemaSubscriptionToSupabase(
  userId: string,
  subscription?: CinemaSubscription
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('profiles')
    .update({
      cinema_subscription: subscription ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error && import.meta.env.DEV) {
    console.error('[Cinema subscription] Unable to sync subscription:', error);
  }
}

/** Valeurs acceptées par les contraintes CHECK de la table `profiles`. */
const GENDERS = ['h', 'f'];
const VIEWING_PREFERENCES = ['cinema', 'streaming', 'both'];
const clampTo010 = (value: number) => Math.max(0, Math.min(10, Math.round(value)));

/**
 * Remonte vers le compte ce que l'utilisateur a renseigné sur cet appareil.
 *
 * Deux régimes, et la distinction compte :
 *
 * - les réponses données à la création du profil (identité, genre, âge, façon de
 *   regarder, plateformes) appartiennent à l'appareil. Le local gagne toujours,
 *   c'est lui que l'utilisateur vient de voir à l'écran ;
 * - la calibration issue de l'onboarding (sévérité, patience, genres favoris,
 *   archétype) ne comble que les trous. Une valeur déjà présente sur le compte
 *   peut venir d'un onboarding fait sur un autre appareil : l'écraser avec un
 *   défaut local détruirait un réglage que personne n'a demandé à changer.
 *
 * Retourne les colonnes réellement modifiées, pour que l'appelant sache si la
 * ligne serveur a bougé sans avoir à la relire.
 */
export async function syncProfileFieldsToSupabase(
  userId: string,
  local: UserProfile,
  remote: Record<string, any>
): Promise<string[]> {
  if (!supabase) return [];

  const patch: Record<string, unknown> = {};

  if (local.firstName && local.firstName !== remote.first_name) {
    patch.first_name = local.firstName;
  }
  if ((local.lastName || null) !== (remote.last_name || null)) {
    patch.last_name = local.lastName || null;
  }
  // Les valeurs sont filtrées sur les contraintes de la table, pas seulement sur
  // le type TypeScript : un profil ancien peut porter une valeur qui n'existait
  // plus au moment où la contrainte a été posée, et l'envoyer ferait rejeter le lot.
  if (GENDERS.includes(local.gender as string) && local.gender !== remote.gender) {
    patch.gender = local.gender;
  }
  if (Number.isFinite(local.age) && (local.age as number) > 0 && local.age !== remote.age) {
    patch.age = Math.round(local.age as number);
  }
  if (
    VIEWING_PREFERENCES.includes(local.viewingPreference as string) &&
    local.viewingPreference !== remote.viewing_preference
  ) {
    patch.viewing_preference = local.viewingPreference;
  }
  if (
    local.streamingPlatforms?.length &&
    JSON.stringify([...local.streamingPlatforms].sort()) !==
      JSON.stringify([...(remote.streaming_platforms || [])].sort())
  ) {
    patch.streaming_platforms = local.streamingPlatforms;
  }

  if (Number.isFinite(local.severityIndex) && remote.severity_index == null) {
    patch.severity_index = clampTo010(local.severityIndex as number);
  }
  if (Number.isFinite(local.patienceLevel) && remote.patience_level == null) {
    patch.patience_level = clampTo010(local.patienceLevel as number);
  }
  if (local.favoriteGenres?.length && !remote.favorite_genres?.length) {
    patch.favorite_genres = local.favoriteGenres;
  }
  if (local.role && !remote.role) {
    patch.role = local.role;
  }
  if (local.isOnboarded && !remote.is_onboarded) {
    patch.is_onboarded = true;
  }

  const changed = Object.keys(patch);
  if (changed.length === 0) return [];

  const stamped = () => ({ updated_at: new Date().toISOString() });

  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, ...stamped() })
    .eq('id', userId);

  if (!error) return changed;

  /**
   * Un UPDATE est atomique : une seule colonne refusée par une contrainte fait
   * rejeter le lot entier, genre et âge compris. On reprend donc colonne par
   * colonne, pour qu'une valeur douteuse n'en condamne pas neuf autres.
   *
   * Les erreurs sont tracées sans condition d'environnement : c'est précisément
   * en production que cet échec s'est produit, et le silence a coûté une session
   * entière de diagnostic à l'aveugle.
   */
  console.warn('[Profil] Remontée groupée refusée, reprise colonne par colonne :', error.message);

  const applied: string[] = [];
  for (const key of changed) {
    const { error: singleError } = await supabase
      .from('profiles')
      .update({ [key]: patch[key], ...stamped() })
      .eq('id', userId);

    if (singleError) console.warn(`[Profil] Colonne ${key} refusée :`, singleError.message);
    else applied.push(key);
  }

  return applied;
}

export function resetMigrationFlag(userId: string) {
  localStorage.removeItem(`migration_completed_${userId}`);
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
