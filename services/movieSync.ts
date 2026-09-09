import { supabase } from './supabase';
import { ActorInfo, AdaptiveRatingData, Movie, MovieStatus, MovieWatch, TvProgress } from '../types';
import { WorkIdentity, WorkKey, workKey } from '../utils/workKey';

/**
 * Synchronisation du profil perso avec Supabase.
 *
 * Ce module ne concerne QUE `user_movies`, c'est-à-dire l'historique personnel du
 * profil rattaché à un compte. Les espaces partagés vivent dans services/supabase.ts
 * et ne sont pas touchés ici.
 *
 * POURQUOI CE MODULE EXISTE
 * La synchronisation était jusqu'ici purement montante : `services/migration.ts`
 * poussait le local vers le serveur, mais rien ne redescendait jamais. Sur un
 * appareil neuf, ou après un vidage du navigateur, l'application repartait donc
 * d'un localStorage vide et l'historique semblait perdu, alors qu'il était parfois
 * sur le serveur. `fetchRemoteMovies` est le chemin descendant qui manquait.
 */

/**
 * Décision « garder séparé », mémorisée par appareil.
 *
 * Sans ce drapeau, la modale de fusion se rouvrirait à chaque lancement : refuser
 * ne fusionne rien, donc les deux côtés gardent de la matière et la condition
 * d'affichage reste vraie indéfiniment. Comme la modale n'a volontairement ni croix
 * ni Échap, l'utilisateur serait piégé.
 *
 * Volontairement en localStorage et non dans Supabase : c'est un choix propre à CET
 * appareil. Un nouvel appareil qui se reconnecte doit se voir reposer la question,
 * pas hériter du « ne plus demander » d'un autre.
 *
 * Convention de nommage alignée sur `bitter_linked_profile_${userId}` d'App.tsx.
 */
const mergeDeclinedKey = (userId: string) => `bitter_merge_declined_${userId}`;

export const hasDeclinedMerge = (userId: string): boolean =>
  localStorage.getItem(mergeDeclinedKey(userId)) === 'true';

export const rememberMergeDeclined = (userId: string): void => {
  localStorage.setItem(mergeDeclinedKey(userId), 'true');
};

/**
 * Réarme la proposition de fusion.
 *
 * C'est l'accroche pour le bouton « Tout réunir » des réglages : l'utilisateur qui
 * change d'avis efface sa décision, et peut relancer `backfillProfileToSupabase`
 * sans risque puisque l'upsert onConflict absorbe les doublons.
 */
export const forgetMergeDecision = (userId: string): void => {
  localStorage.removeItem(mergeDeclinedKey(userId));
};

/** Colonnes lues depuis user_movies, alignées sur ce qu'écrit movieToRow. */
const MOVIE_COLUMNS = `
  id, tmdb_id, title, director, director_id, actors, actor_ids, year, release_date,
  runtime, genre, poster_url, tmdb_rating, status, date_watched, theme, tags,
  media_type, story, visuals, acting, sound, vibe_story, vibe_emotion, vibe_fun,
  vibe_visual, vibe_tension, smartphone_factor, hype, review, adaptive_rating,
  watches, created_at, rated_at,
  season_number, series_tmdb_id, series_title, number_of_seasons, tv_progress
`;

/**
 * Colonnes de la clé d'unicité, telles que PostgREST doit les nommer.
 *
 * Elles correspondent à la contrainte `user_movies_work_key`. PostgREST traduit
 * cette chaîne en `ON CONFLICT (…)`, qui exige un index unique portant
 * exactement ces colonnes : la constante existe pour qu'un seul endroit ait à
 * changer le jour où la clé évolue, plutôt que quatre appels dispersés dans
 * deux fichiers.
 */
export const WORK_KEY_COLUMNS = 'profile_id,media_type,tmdb_id,season_number';

interface UserMovieRow {
  id: string;
  tmdb_id: number | null;
  title: string;
  director: string;
  director_id: number | null;
  actors: string | null;
  actor_ids: unknown;
  year: number;
  release_date: string | null;
  runtime: number | null;
  genre: string;
  poster_url: string | null;
  tmdb_rating: number | null;
  status: string;
  date_watched: string | null;
  theme: string | null;
  tags: string[] | null;
  media_type: string | null;
  story: number | null;
  visuals: number | null;
  acting: number | null;
  sound: number | null;
  vibe_story: number | null;
  vibe_emotion: number | null;
  vibe_fun: number | null;
  vibe_visual: number | null;
  vibe_tension: number | null;
  smartphone_factor: number | null;
  hype: number | null;
  review: string | null;
  adaptive_rating: unknown;
  watches: unknown;
  created_at: string | null;
  rated_at: string | null;
  season_number: number | null;
  series_tmdb_id: number | null;
  series_title: string | null;
  number_of_seasons: number | null;
  tv_progress: unknown;
}

const toTimestamp = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
};

/**
 * `actor_ids` a été écrit avec `JSON.stringify` dans une colonne jsonb : selon les
 * lignes, il revient donc soit en tableau, soit en chaîne encodée. On accepte les deux
 * plutôt que de laisser une ligne ancienne casser tout le chargement.
 */
const parseActorIds = (value: unknown): ActorInfo[] | undefined => {
  if (Array.isArray(value)) return value as ActorInfo[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ActorInfo[]) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const parseJsonColumn = <T,>(value: unknown): T | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
};

/**
 * Reconstruit un film local à partir d'une ligne serveur.
 *
 * L'identifiant local reprend celui de la ligne : il est ainsi stable d'un appareil
 * à l'autre, ce qui évite de recréer des doublons à chaque téléchargement.
 */
export const rowToMovie = (row: UserMovieRow): Movie => {
  const watches = parseJsonColumn<MovieWatch[]>(row.watches);
  const ratings = {
    story: row.story ?? 0,
    visuals: row.visuals ?? 0,
    acting: row.acting ?? 0,
    sound: row.sound ?? 0,
  };

  return {
    id: row.id,
    tmdbId: row.tmdb_id ?? undefined,
    title: row.title,
    director: row.director,
    directorId: row.director_id ?? undefined,
    actors: row.actors ?? '',
    actorIds: parseActorIds(row.actor_ids),
    year: row.year,
    releaseDate: row.release_date ?? undefined,
    runtime: row.runtime ?? undefined,
    genre: row.genre,
    ratings,
    review: row.review ?? '',
    dateAdded: toTimestamp(row.created_at) ?? Date.now(),
    dateWatched: toTimestamp(row.date_watched),
    theme: (row.theme as Movie['theme']) ?? 'black',
    posterUrl: row.poster_url ?? undefined,
    status: (row.status === 'watched' ? 'watched' : 'watchlist') as MovieStatus,
    tmdbRating: row.tmdb_rating ?? undefined,
    tags: row.tags ?? undefined,
    smartphoneFactor: row.smartphone_factor ?? undefined,
    hype: row.hype ?? undefined,
    vibe:
      row.vibe_story === null &&
      row.vibe_emotion === null &&
      row.vibe_fun === null &&
      row.vibe_visual === null &&
      row.vibe_tension === null
        ? undefined
        : {
            story: row.vibe_story ?? 5,
            emotion: row.vibe_emotion ?? 5,
            fun: row.vibe_fun ?? 5,
            visual: row.vibe_visual ?? 5,
            tension: row.vibe_tension ?? 5,
          },
    mediaType: row.media_type === 'tv' ? 'tv' : 'movie',
    adaptiveRating: parseJsonColumn<AdaptiveRatingData>(row.adaptive_rating),
    watches,
    watch_count: watches?.length,
    seasonNumber: row.season_number ?? undefined,
    seriesTmdbId: row.series_tmdb_id ?? undefined,
    seriesTitle: row.series_title ?? undefined,
    numberOfSeasons: row.number_of_seasons ?? undefined,
    tvProgress: parseJsonColumn<TvProgress>(row.tv_progress),
  };
};

/**
 * Chemin descendant : récupère l'historique personnel du compte.
 *
 * Renvoie `null` en cas d'échec, ce qui est volontairement distinct d'un tableau
 * vide. L'appelant NE DOIT PAS écraser le cache local sur un `null` : une panne
 * réseau ne doit jamais se traduire par une perte d'historique à l'écran.
 */
export const fetchRemoteMovies = async (
  userId: string
): Promise<{ movies: Movie[] } | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_movies')
    .select(MOVIE_COLUMNS)
    .eq('profile_id', userId)
    // Les pierres tombales ne remontent jamais à l'écran.
    .is('deleted_at', null);

  if (error) {
    if (import.meta.env.DEV) console.error('[Sync] Lecture de user_movies échouée :', error);
    return null;
  }

  return { movies: (data as unknown as UserMovieRow[]).map(rowToMovie) };
};

/**
 * Restreint une requête à UNE œuvre précise.
 *
 * Le filtre portait sur le seul `tmdb_id`. Sur une série, cela visait d'un coup
 * la ligne-série et toutes ses saisons : supprimer la saison 2 aurait effacé la
 * série entière. Les trois colonnes de la clé sont donc toutes exigées, y
 * compris `season_number` qui doit être testé comme nul et non ignoré.
 */
interface WorkScopedQuery<T> {
  eq(column: string, value: unknown): T;
  is(column: string, value: null): T;
}

const scopeToWork = <T extends WorkScopedQuery<T>>(
  query: T,
  userId: string,
  work: WorkIdentity
): T => {
  const scoped = query
    .eq('profile_id', userId)
    .eq('tmdb_id', work.tmdbId)
    .eq('media_type', work.mediaType ?? 'movie');
  return work.seasonNumber == null
    ? scoped.is('season_number', null)
    : scoped.eq('season_number', work.seasonNumber);
};

/**
 * Marque une œuvre comme supprimée côté compte.
 *
 * UPDATE et non DELETE : la ligne subsiste comme pierre tombale pour que les
 * autres appareils, dont le cache local est peut-être antérieur, ne fassent pas
 * réapparaître l'œuvre à la prochaine remontée d'historique.
 *
 * Sans tmdbId, il n'existe aucune clé stable entre local et serveur : on ne peut
 * rien marquer, et on le signale à l'appelant plutôt que d'échouer en silence.
 */
export const softDeleteMovie = async (
  userId: string,
  work: WorkIdentity | undefined
): Promise<boolean> => {
  if (!supabase || work?.tmdbId == null) return false;

  const { error } = await scopeToWork(
    supabase.from('user_movies').update({ deleted_at: new Date().toISOString() }),
    userId,
    work
  );

  if (error) {
    // Toujours journalisé, pas seulement en développement : une synchro qui échoue
    // en silence est exactement ce qui avait laissé passer le bug d'origine.
    console.error('[Sync] Suppression douce échouée :', error);
    return false;
  }
  return true;
};

/**
 * Annule une suppression douce.
 *
 * Appelé quand l'utilisateur clique sur « Annuler » : la suppression est propagée
 * immédiatement au clic, pas après le délai, donc il faut savoir revenir en arrière.
 */
export const restoreDeletedMovie = async (
  userId: string,
  work: WorkIdentity | undefined
): Promise<boolean> => {
  if (!supabase || work?.tmdbId == null) return false;

  const { error } = await scopeToWork(
    supabase.from('user_movies').update({ deleted_at: null }),
    userId,
    work
  );

  if (error) {
    console.error('[Sync] Restauration échouée :', error);
    return false;
  }
  return true;
};

/**
 * Œuvres déjà supprimées sur ce compte, par clé composite.
 *
 * Sert au backfill pour ne pas ressusciter ce que l'utilisateur a supprimé
 * ailleurs. Renvoie un ensemble vide en cas d'échec : mieux vaut un backfill
 * complet qu'un backfill bloqué, la resynchronisation restant rejouable.
 */
export const getDeletedWorkKeys = async (userId: string): Promise<Set<WorkKey>> => {
  if (!supabase) return new Set();

  const { data, error } = await supabase
    .from('user_movies')
    .select('tmdb_id, media_type, season_number')
    .eq('profile_id', userId)
    .not('deleted_at', 'is', null);

  if (error) {
    if (import.meta.env.DEV) console.error('[Sync] Lecture des suppressions échouée :', error);
    return new Set();
  }

  const rows = data as { tmdb_id: number | null; media_type: string | null; season_number: number | null }[];
  return new Set(
    rows
      .filter((row) => row.tmdb_id != null)
      .map((row) =>
        workKey({
          tmdbId: row.tmdb_id as number,
          mediaType: row.media_type === 'tv' ? 'tv' : 'movie',
          seasonNumber: row.season_number ?? undefined,
        })
      )
  );
};

export interface BackfillReport {
  pushed: number;
  failed: string[];
  /**
   * Films volontairement laissés de côté parce qu'ils ont été supprimés depuis un
   * autre appareil. Ce n'est pas un échec, c'est le comportement attendu.
   */
  skippedDeleted: number;
  /** Renseigné quand l'échec est global et non attribuable à un film précis. */
  fatalError?: string;
}

/**
 * Ligne envoyée à `user_movies`. **L'unique constructeur** — services/migration.ts
 * l'importe au lieu d'en tenir un second.
 *
 * Il en existait effectivement deux, et ils avaient divergé : l'un écrivait
 * `comment` et `shared_to_feed`, l'autre non ; l'un encodait `actor_ids` avec
 * `JSON.stringify`, l'autre passait le tableau natif. Ajouter les colonnes de
 * saison à un seul des deux aurait fait disparaître la progression selon le
 * chemin d'écriture emprunté.
 */
export const movieToRow = (movie: Movie, userId: string) => ({
  profile_id: userId,
  tmdb_id: movie.tmdbId ?? null,
  title: movie.title,
  director: movie.director,
  director_id: movie.directorId ?? null,
  actors: movie.actors || null,
  // Tableau natif et non chaîne encodée : la colonne est en jsonb, une chaîne y
  // serait stockée comme valeur JSON de type string et deviendrait illisible.
  actor_ids: movie.actorIds ?? null,
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
  // écrit par la personne est dans `comment`, et il n'était jamais envoyé par ce
  // chemin : le fil ne pouvait donc afficher qu'un résumé là où l'on attend une
  // opinion.
  comment: movie.comment || null,
  adaptive_rating: movie.adaptiveRating ?? null,
  // Absent du modèle local des anciens films : on publie par défaut, ce qui
  // correspond au réglage choisi et à ce que la colonne vaut déjà en base.
  shared_to_feed: movie.shareToFeed !== false,
  watches: movie.watches ?? null,
  // Déterministe et toujours présent : voir la note détaillée dans
  // services/migration.ts. `new Date()` en repli réécrirait la date de création à
  // chaque resynchronisation, et une clé conditionnelle casserait l'upsert groupé.
  created_at: new Date(movie.dateAdded || movie.dateWatched || 0).toISOString(),
  rated_at: movie.dateWatched ? new Date(movie.dateWatched).toISOString() : null,
  // `season_number` participe à la clé d'unicité : il doit être explicitement
  // nul pour un film, jamais absent, sinon l'upsert viserait une autre ligne.
  season_number: movie.seasonNumber ?? null,
  series_tmdb_id: movie.seriesTmdbId ?? null,
  series_title: movie.seriesTitle ?? null,
  number_of_seasons: movie.numberOfSeasons ?? null,
  tv_progress: movie.tvProgress ?? null,
});

/**
 * Pousse l'historique local d'un profil vers le compte, et rend compte.
 *
 * Deux passes volontaires : un envoi groupé, rapide, et en cas d'échec seulement,
 * un envoi film par film pour savoir LESQUELS ont échoué. Un rapport qui dit
 * « 2 échoués » sans nommer les films ne sert à rien pour corriger, et c'est
 * précisément l'échec silencieux qui avait laissé passer le problème initial.
 *
 * La contrainte UNIQUE(profile_id, tmdb_id) existe déjà : l'upsert ne crée pas de
 * doublon. Les films sans tmdbId ne peuvent pas être dédoublonnés par cette
 * contrainte, ils sont donc exclus pour éviter d'empiler des copies à chaque appel.
 */
export const backfillProfileToSupabase = async (
  userId: string,
  movies: Movie[]
): Promise<BackfillReport> => {
  if (!supabase) {
    return { pushed: 0, failed: [], skippedDeleted: 0, fatalError: 'supabase-not-configured' };
  }

  // On ne remonte JAMAIS un film que l'utilisateur a supprimé depuis un autre
  // appareil. Le scénario visé : suppression sur le téléphone, puis reconnexion
  // sur un vieil appareil dont le cache est antérieur. « Tout réunir » ne doit pas
  // ressusciter ce film. Ce comportement est propre au backfill : un réajout
  // délibéré via l'écran d'ajout passe par un autre chemin et lève la suppression.
  const deletedKeys = await getDeletedWorkKeys(userId);

  const withTmdbId = movies.filter((movie) => movie.tmdbId != null);
  const syncable = withTmdbId.filter((movie) => !deletedKeys.has(workKey(movie)));
  const skippedDeleted = withTmdbId.length - syncable.length;

  if (syncable.length === 0) return { pushed: 0, failed: [], skippedDeleted };

  const batch = await supabase
    .from('user_movies')
    .upsert(syncable.map((movie) => movieToRow(movie, userId)), {
      onConflict: WORK_KEY_COLUMNS,
      ignoreDuplicates: false,
    });

  if (!batch.error) return { pushed: syncable.length, failed: [], skippedDeleted };

  if (import.meta.env.DEV) {
    console.error('[Backfill] Envoi groupé échoué, reprise film par film :', batch.error);
  }

  const report: BackfillReport = { pushed: 0, failed: [], skippedDeleted };
  for (const movie of syncable) {
    try {
      const { error } = await supabase
        .from('user_movies')
        .upsert(movieToRow(movie, userId), {
          onConflict: WORK_KEY_COLUMNS,
          ignoreDuplicates: false,
        });

      if (error) {
        if (import.meta.env.DEV) console.error(`[Backfill] "${movie.title}" :`, error);
        report.failed.push(`${movie.title} · ${error.message}`);
      } else {
        report.pushed += 1;
      }
    } catch {
      report.failed.push(`${movie.title} · exception`);
    }
  }

  return report;
};

/**
 * Fusionne l'historique serveur et l'historique local.
 *
 * Le serveur fait foi, mais on ne jette jamais une œuvre locale absente du
 * serveur : elle vient probablement d'être ajoutée hors ligne, ou n'a pas encore
 * été poussée.
 *
 * Le dédoublonnage se fait sur la clé composite et non sur le seul `tmdbId` :
 * deux saisons d'une même série ont chacune leur identifiant TMDB, mais un film
 * et une série peuvent partager le leur. Indexer sur le nombre seul faisait donc
 * disparaître l'un des deux à chaque fusion.
 */
export const mergeRemoteAndLocal = (remote: Movie[], local: Movie[]): Movie[] => {
  const byKey = new Map<WorkKey, Movie>();
  const withoutTmdbId: Movie[] = [];

  remote.forEach((movie) => {
    if (movie.tmdbId != null) byKey.set(workKey(movie), movie);
    else withoutTmdbId.push(movie);
  });

  local.forEach((movie) => {
    if (movie.tmdbId == null) {
      withoutTmdbId.push(movie);
      return;
    }
    const key = workKey(movie);
    if (!byKey.has(key)) byKey.set(key, movie);
  });

  return [...byKey.values(), ...withoutTmdbId].sort(
    (a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0)
  );
};
