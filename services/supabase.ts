import { createClient } from '@supabase/supabase-js';
import { AdaptiveRatingData } from '../types';

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
    last_name?: string;
    avatar_url?: string;
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
  /**
   * Grille Bitter+ telle qu'elle est stockée dans `user_movies`. Nulle pour toute
   * note posée avant l'unification, et pour une note donnée en mode Bitter simple :
   * dans les deux cas on retombe sur la moyenne des quatre critères.
   */
  adaptive_rating?: AdaptiveRatingData | null;
  rating_mode?: 'bitter' | 'bitter_plus' | null;
  rated_at: string;
  profile?: {
    first_name: string;
  };
}

export interface MovieVote {
  id: string;
  movie_id: string;
  profile_id: string;
  /** true = partant, false = pas envie. Les votes antérieurs valent tous true. */
  interested: boolean;
  created_at: string;
}

// ===============================================
// FONCTIONS POUR LES ESPACES PARTAGÉS
// ===============================================

/**
 * Résultat d'une écriture sur un espace.
 *
 * Forme plate plutôt qu'union discriminée : `strict` est désactivé dans ce projet,
 * TypeScript ne sait pas restreindre une union sur un booléen littéral et l'appelant
 * devrait caster pour lire `error`.
 */
export interface SpaceWrite {
  ok: boolean;
  error?: string;
}

/**
 * Résultat d'une lecture.
 *
 * `data` porte toujours un tableau, pour que l'appelant puisse itérer sans garde.
 * `error` est ce qui manquait : sans lui, un refus RLS et un espace réellement vide
 * produisent le même écran, et personne ne peut faire la différence.
 */
export interface SpaceRead<T> {
  data: T[];
  error?: string;
}

/**
 * Une coupure réseau remonte du navigateur, pas de Postgres, et sous une forme
 * illisible : « TypeError: Load failed » sur Safari, « Failed to fetch » ailleurs.
 * Servir ça tel quel à l'utilisateur ne lui apprend rien et l'inquiète.
 */
const NETWORK_HINTS = [
  'load failed',
  'failed to fetch',
  'networkerror',
  'network request failed',
];

/**
 * Borne une lecture dans le temps.
 *
 * Une requête Supabase n'a pas de délai maximum : si le serveur ne répond jamais,
 * la promesse ne se résout pas et l'écran reste en chargement pour toujours, sans
 * message ni sortie. C'est ce qui obligeait à relancer l'app entière.
 */
export const SPACE_TIMEOUT_MS = 12000;

const withTimeout = async <T>(work: PromiseLike<T>, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[Espaces] Aucune réponse après ${SPACE_TIMEOUT_MS} ms`);
      resolve(fallback);
    }, SPACE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(work), guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Les erreurs d'espace partagé sont tracées sans condition d'environnement.
 *
 * Les conditionner à `import.meta.env.DEV` revient à se rendre aveugle très
 * exactement là où le défaut se produit : en production, chez l'utilisateur.
 */
const logSpace = (action: string, error: unknown): string => {
  const raw = (error as { message?: string })?.message || 'Erreur inconnue côté serveur';

  // La console garde toujours le message brut : c'est lui qui sert au diagnostic.
  console.warn(`[Espaces] ${action} : ${raw}`, error);

  const lower = raw.toLowerCase();
  if (NETWORK_HINTS.some((hint) => lower.includes(hint))) {
    return 'Connexion perdue. Vérifie ton réseau, puis réessaie.';
  }

  return raw;
};


export const SPACE_TIMEOUT_MESSAGE = 'Le serveur ne répond pas. Réessaie dans un instant.';

/**
 * Lecture bornée dans le temps.
 *
 * Une requête Supabase gelée ne rejette jamais : sur iOS, une requête partie avant
 * la mise en veille de l'app peut ne plus jamais revenir au réveil. Sans borne,
 * l'appelant attend indéfiniment, et `Promise.all` fige alors les trois lectures
 * de l'écran pour une seule qui traîne. C'est ce qui obligeait à relancer l'app.
 */
const readRows = async <T>(
  action: string,
  query: PromiseLike<{ data: any; error: any }>
): Promise<SpaceRead<T>> => {
  const { data, error, timedOut } = await withTimeout(
    Promise.resolve(query).then((r: any) => ({ ...r, timedOut: false })),
    { data: null, error: null, timedOut: true }
  );

  if (timedOut) return { data: [], error: SPACE_TIMEOUT_MESSAGE };
  if (error) return { data: [], error: logSpace(action, error) };
  return { data: (data || []) as T[] };
};

/**
 * Une écriture refusée par le RLS ne lève pas d'erreur : elle touche zéro ligne.
 * Comparer `error` à null ne suffit donc pas à conclure au succès, il faut compter
 * ce qui a réellement bougé. C'est ce contrôle qui manquait partout ici.
 */
const wrote = (action: string, rows: unknown[] | null, error: unknown): SpaceWrite => {
  if (error) return { ok: false, error: logSpace(action, error) };
  if (!rows || rows.length === 0) {
    const message = 'Opération refusée : tu n’as pas les droits, ou la ligne n’existe plus.';
    console.warn(`[Espaces] ${action} : aucune ligne touchée`);
    return { ok: false, error: message };
  }
  return { ok: true };
};

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
    logSpace('Création de l’espace', error);
    throw error;
  }

  // Cast aveugle auparavant : l'appelant déréférençait aussitôt `invite_code`.
  if (!data || !(data as SharedSpace).id) {
    throw new Error('L’espace n’a pas pu être créé.');
  }

  return data as SharedSpace;
}

/**
 * Récupère tous les espaces d'un utilisateur (uniquement ceux où il est actif)
 */
export async function getUserSpaces(userId: string): Promise<SpaceRead<SharedSpace>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  const { data, error, timedOut } = await withTimeout(
    supabase
      .from('shared_spaces')
      .select(
        `
      *,
      space_members!inner(profile_id)
    `
      )
      .eq('space_members.profile_id', userId)
      .eq('space_members.is_active', true) // Only fetch spaces where user is active
      .then((r: any) => ({ ...r, timedOut: false })),
    { data: null, error: null, timedOut: true }
  );

  if (timedOut) return { data: [], error: 'Le serveur ne répond pas. Réessaie dans un instant.' };
  if (error) return { data: [], error: logSpace('Lecture des espaces', error) };

  return { data: data || [] };
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

    // La RPC peut rendre la main sans lever et sans espace. Sans ce contrôle,
    // l'interface affichait « Rejoint ! » puis refermait la modale sur rien.
    if (!data || !(data as SharedSpace).id) {
      return { success: false, error: 'Code invalide ou espace introuvable.' };
    }

    return { success: true, space: data as SharedSpace };
  } catch (e: any) {
    return {
      success: false,
      error: logSpace('Rejoindre par code', e) || 'Code invalide.',
    };
  }
}

/**
 * Quitter un espace partagé (Soft Delete)
 */
export async function leaveSharedSpace(spaceId: string, userId: string): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  // Soft delete: set is_active to false and record left_at timestamp
  const { data, error } = await supabase
    .from('space_members')
    .update({
      is_active: false,
      left_at: new Date().toISOString(),
    })
    .eq('space_id', spaceId)
    .eq('profile_id', userId)
    .select('id');

  return wrote('Sortie de l’espace', data, error);
}

/**
 * Renomme un espace, ou change sa description.
 *
 * Ces deux colonnes existaient depuis le début sans qu'aucun code ne puisse les
 * écrire : la table n'avait pas de politique UPDATE, et l'app pas de bouton.
 */
export async function updateSpace(
  spaceId: string,
  patch: { name?: string; description?: string }
): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase
    .from('shared_spaces')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', spaceId)
    .select('id');

  return wrote('Modification de l’espace', data, error);
}

/** Supprime définitivement un espace. Les films, notes et votes tombent en cascade. */
export async function deleteSpace(spaceId: string): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase
    .from('shared_spaces')
    .delete()
    .eq('id', spaceId)
    .select('id');

  return wrote('Suppression de l’espace', data, error);
}

/**
 * Exclut un membre, en sortie douce plutôt qu'en suppression.
 *
 * Ses notes et ses votes restent attachés à l'historique de l'espace, ce qu'une
 * suppression en cascade aurait effacé. En revanche il perd l'accès, puisque
 * `is_member_of_space` exige `is_active`.
 *
 * Attention : cela ne l'empêche pas de revenir s'il détient encore le code. Pour
 * fermer réellement la porte, il faut renouveler le code d'invitation.
 */
export async function removeMember(spaceId: string, profileId: string): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase
    .from('space_members')
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq('space_id', spaceId)
    .eq('profile_id', profileId)
    .select('id');

  return wrote('Exclusion du membre', data, error);
}

/** Transmet la propriété. Atomique côté serveur, pour ne jamais laisser deux propriétaires. */
export async function transferOwnership(
  spaceId: string,
  toProfileId: string
): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  const { error } = await supabase.rpc('transfer_space_ownership', {
    _space_id: spaceId,
    _to_profile: toProfileId,
  });

  if (error) return { ok: false, error: logSpace('Transfert de propriété', error) };
  return { ok: true };
}

/** Renouvelle le code d'invitation. Seul moyen d'empêcher un ancien membre de revenir. */
export async function regenerateInviteCode(
  spaceId: string
): Promise<{ code: string | null; error?: string }> {
  if (!supabase) return { code: null, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase.rpc('regenerate_invite_code', {
    _space_id: spaceId,
  });

  if (error) return { code: null, error: logSpace('Renouvellement du code', error) };
  return { code: data as string };
}

/**
 * Récupère tous les films d'un espace partagé
 */
export async function getSpaceMovies(spaceId: string): Promise<SpaceRead<SharedMovie>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  const result = await readRows<any>(
    'Lecture des films',
    supabase
      .from('shared_movies')
      .select(
        `
      *,
      added_by_profile:profiles!added_by(first_name, last_name, avatar_url)
    `
      )
      .eq('space_id', spaceId)
      .order('added_at', { ascending: false })
  );

  if (result.error) return { data: [], error: result.error };

  return {
    data: result.data.map((movie: any) => ({
      ...movie,
      genres: movie.genres?.length ? movie.genres : (movie.genre ? movie.genre.split(', ') : []),
    })) as SharedMovie[],
  };
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
): Promise<{ movie: SharedMovie | null; error?: string }> {
  if (!supabase) return { movie: null, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase
    .from('shared_movies')
    .insert({
      space_id: spaceId,
      added_by: userId,
      ...movieData,
    })
    .select()
    .single();

  if (error) return { movie: null, error: logSpace('Ajout du film', error) };

  return { movie: data };
}

/**
 * Supprimer un film d'un espace (uniquement par l'auteur ou admin de l'espace)
 */
export async function deleteSharedMovie(movieId: string): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase
    .from('shared_movies')
    .delete()
    .eq('id', movieId)
    .select('id');
  return wrote('Suppression du film', data, error);
}

/**
 * Marquer un film de la watchlist comme "Regardé"
 *
 * `added_at` n'est plus réécrit : c'est la date d'ajout, et l'écraser à chaque
 * bascule effaçait définitivement quand le film avait été suggéré, pour ne plus
 * refléter que l'ordre des changements de statut.
 */
export async function markMovieAsWatched(movieId: string): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase
    .from('shared_movies')
    .update({ status: 'watched' })
    .eq('id', movieId)
    .select('id');
  return wrote('Passage en vu', data, error);
}

/**
 * Gérer les votes "Je veux voir" sur la watchlist
 */
/**
 * Pose, change ou retire un avis sur une suggestion.
 *
 * `interested` vaut true pour « partant », false pour « pas envie », et null pour
 * retirer son vote. Reposer le même avis l'annule, ce qui rend les deux boutons
 * réversibles sans en ajouter un troisième.
 */
export async function setMovieVote(
  movieId: string,
  userId: string,
  interested: boolean | null
): Promise<SpaceWrite> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };

  // `maybeSingle` et non `single` : sur zéro ligne, `single` renvoie une erreur
  // PGRST116 que l'ancien code ne lisait pas. Le premier vote ne fonctionnait que
  // parce que l'erreur était ignorée, pas parce qu'elle n'existait pas.
  const { data: existing, error: readError } = await supabase
    .from('space_movie_votes')
    .select('id, interested')
    .eq('movie_id', movieId)
    .eq('profile_id', userId)
    .maybeSingle();

  if (readError) return { ok: false, error: logSpace('Lecture du vote', readError) };

  const shouldClear = interested === null || (existing && existing.interested === interested);

  if (existing && shouldClear) {
    const { data, error } = await supabase
      .from('space_movie_votes')
      .delete()
      .eq('id', existing.id)
      .select('id');
    return wrote('Retrait du vote', data, error);
  }

  if (existing) {
    // Un UPDATE plutôt qu'une suppression suivie d'une insertion : changer d'avis
    // ne doit pas pouvoir laisser quelqu'un sans vote si la seconde écriture rate.
    const { data, error } = await supabase
      .from('space_movie_votes')
      .update({ interested })
      .eq('id', existing.id)
      .select('id');
    return wrote('Changement d’avis', data, error);
  }

  if (interested === null) return { ok: true };

  const { data, error } = await supabase
    .from('space_movie_votes')
    .insert({ movie_id: movieId, profile_id: userId, interested })
    .select('id');
  return wrote('Vote', data, error);
}

/**
 * Récupère tous les votes pour un film ou un espace
 */
export async function getSpaceMovieVotes(spaceId: string): Promise<SpaceRead<MovieVote>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };
  return readRows<MovieVote>(
    'Lecture des votes',
    supabase
      .from('space_movie_votes')
      .select('*, shared_movies!inner(space_id)')
      .eq('shared_movies.space_id', spaceId)
  );
}

/**
 * Récupère les notes d'un film
 */
export async function getMovieRatings(movieId: string): Promise<SpaceRead<MovieRating>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  return readRows<MovieRating>(
    'Lecture des notes',
    supabase
      .from('movie_ratings')
      .select(
        `
      *,
      profile:profiles(first_name, last_name)
    `
      )
      .eq('movie_id', movieId)
  );
}

/**
 * Toutes les notes de tous les films d'un espace, en une requête.
 *
 * Le chargement film par film servait l'affichage d'une carte dépliée ; il ne
 * permet pas de raisonner sur le groupe, qui exige de voir l'ensemble d'un coup.
 * La jointure interne sur `shared_movies` restreint à l'espace demandé.
 */
export async function getSpaceRatings(
  spaceId: string
): Promise<SpaceRead<MovieRating & { movie_id: string }>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  return readRows(
    'Lecture des notes de l’espace',
    supabase
      .from('movie_ratings')
      .select('*, shared_movies!inner(space_id), profile:profiles(first_name)')
      .eq('shared_movies.space_id', spaceId)
  );
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
    /**
     * Grille Bitter+ complète, exactement la même forme que `user_movies`.
     * Absente pour une note posée en mode Bitter simple.
     */
    adaptive_rating?: unknown;
    rating_mode?: 'bitter' | 'bitter_plus';
  }
): Promise<{ rating: MovieRating | null; error?: string }> {
  if (!supabase) return { rating: null, error: 'Sauvegarde en ligne indisponible' };

  const { data, error } = await supabase
    .from('movie_ratings')
    // `onConflict` est indispensable : sans lui PostgREST vise la clé primaire `id`,
    // jamais fournie ici, et l'ordre part en INSERT pur. Il heurtait alors l'unicité
    // (movie_id, profile_id), si bien que modifier son verdict échouait à tous les coups.
    .upsert(
      {
        movie_id: movieId,
        profile_id: userId,
        ...ratings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'movie_id,profile_id' }
    )
    .select()
    .single();

  if (error) return { rating: null, error: logSpace('Enregistrement du verdict', error) };

  return { rating: data };
}

/**
 * Récupère les membres actifs d'un espace avec leurs détails
 */
export async function getSpaceMembers(spaceId: string): Promise<SpaceRead<SpaceMember>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  return readRows<SpaceMember>(
    'Lecture des membres',
    supabase
      .from('space_members')
      .select(
        `
      *,
      profile:profiles(first_name, last_name, bio, location, website, avatar_url)
    `
      )
      .eq('space_id', spaceId)
      .eq('is_active', true) // Filter only active members
  );
}

/**
 * Les quatre critères d'un film, quelle que soit la façon dont il a été noté.
 *
 * En mode Bitter+, les colonnes story/visuals/acting/sound reçoivent toutes la
 * MÊME valeur, la note pondérée, pour que les affichages hérités restent justes.
 * Les lire comme quatre critères distincts donne donc quatre fois le même nombre,
 * et tout écart calculé dessus est identique sur les quatre lignes.
 *
 * L'ordre de préférence suit la richesse réelle de la donnée : la grille adaptative
 * d'abord, `quality_metrics` ensuite, qui existe précisément pour cette raison, et
 * les colonnes héritées en dernier recours pour les notes en mode Bitter simple.
 */
const extractCriteria = (row: any) => {
  const byKey = new Map<string, number>(
    (row.adaptive_rating?.criteria ?? []).map((c: any) => [c.key, Number(c.value)])
  );
  const qm = row.quality_metrics ?? null;

  const pick = (adaptiveKey: string, qualityKey: string, legacy: unknown) => {
    const fromAdaptive = byKey.get(adaptiveKey);
    if (Number.isFinite(fromAdaptive)) return fromAdaptive as number;
    const fromQuality = qm?.[qualityKey];
    if (Number.isFinite(fromQuality)) return Number(fromQuality);
    return Number(legacy);
  };

  return {
    story: pick('scenario', 'scenario', row.story),
    visuals: pick('image', 'visual', row.visuals),
    acting: pick('interpretation', 'acting', row.acting),
    sound: pick('sound', 'sound', row.sound),
  };
};

export interface MemberFilm {
  id: string;
  tmdbId: number | null;
  title: string;
  director: string;
  year: number;
  genre: string | null;
  posterUrl?: string;
  /** Note telle que son auteur l'a vue : pondérée si Bitter+, moyenne des quatre sinon. */
  rating: number;
  /** Les quatre critères bruts, pour comparer non plus des notes mais des regards. */
  criteria: { story: number; visuals: number; acting: number; sound: number };
}

/**
 * Films notés d'un membre, en une seule lecture.
 *
 * Remplace les deux requêtes séparées qui ramenaient d'un côté un top 5, de l'autre
 * un compte et une moyenne : tout se calcule à partir de la même liste, et une
 * comparaison entre deux personnes a de toute façon besoin des films eux-mêmes.
 *
 * Lisible grâce à la politique « Space members can view each other movies ». Un
 * non co-membre reçoit une liste vide, ce qui est le comportement voulu.
 */
export async function getMemberFilms(profileId: string): Promise<SpaceRead<MemberFilm>> {
  if (!supabase) return { data: [], error: 'Sauvegarde en ligne indisponible' };

  const result = await readRows<any>(
    'Lecture des films du membre',
    supabase
      .from('user_movies')
      .select('id, tmdb_id, title, director, year, genre, poster_url, story, visuals, acting, sound, adaptive_rating, quality_metrics')
      .eq('profile_id', profileId)
      .eq('status', 'watched')
      .is('deleted_at', null)
      .not('story', 'is', null)
  );

  if (result.error) return { data: [], error: result.error };

  const films = result.data.map((row: any) => {
    const weighted = row.adaptive_rating?.weightedRating;
    const rating =
      typeof weighted === 'number' && Number.isFinite(weighted)
        ? weighted
        : (Number(row.story) + Number(row.visuals) + Number(row.acting) + Number(row.sound)) / 4;

    return {
      id: row.id,
      tmdbId: row.tmdb_id ?? null,
      title: row.title,
      director: row.director || '',
      year: row.year || 0,
      genre: row.genre || null,
      posterUrl: row.poster_url || undefined,
      rating,
      criteria: extractCriteria(row),
    } as MemberFilm;
  });

  return { data: films };
}

/**
 * Top 5 films personnels les mieux notés d'un membre (depuis user_movies)
 */
export async function getMemberTopFilms(
  profileId: string,
  limit = 5
): Promise<{ id: string; title: string; poster_url?: string; year: number; director: string; avg_rating: number }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_movies')
    .select('id, title, poster_url, year, director, story, visuals, acting, sound')
    .eq('profile_id', profileId)
    .eq('status', 'watched')
    // Un film supprimé n'a rien à faire dans un palmarès.
    .is('deleted_at', null)
    .not('story', 'is', null);
  if (error) {
    if (import.meta.env.DEV) console.error('Error fetching member top films:', error);
    return [];
  }
  return (data || [])
    .map((r: any) => ({
      id: r.id,
      title: r.title,
      poster_url: r.poster_url,
      year: r.year,
      director: r.director,
      avg_rating: Math.round(((r.story + r.visuals + r.acting + r.sound) / 4) * 10) / 10,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating)
    .slice(0, limit);
}

/**
 * Stats d'un membre (depuis user_movies)
 */
export async function getMemberStats(
  profileId: string
): Promise<{ watchedCount: number; avgRating: number }> {
  if (!supabase) return { watchedCount: 0, avgRating: 0 };
  const { data, error } = await supabase
    .from('user_movies')
    .select('story, visuals, acting, sound')
    .eq('profile_id', profileId)
    .eq('status', 'watched')
    // Sinon les films supprimés continueraient de peser dans la moyenne.
    .is('deleted_at', null)
    .not('story', 'is', null);
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

/**
 * Charge tous les films personnels d'un user depuis Supabase
 */
export async function getUserMovies(userId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('profile_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    if (import.meta.env.DEV) console.error('Error loading user movies:', error);
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
