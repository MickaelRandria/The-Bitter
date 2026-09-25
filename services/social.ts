/**
 * « Voir avec… », « Ton avis ? » et les liens d'invitation.
 *
 * Tout passe par les fonctions serveur de la migration `20260925_voir_avec` :
 * l'app n'écrit jamais directement dans `notifications` ni dans `share_links`.
 * C'est le serveur qui vérifie qu'on ne s'adresse qu'à quelqu'un que l'on connaît
 * déjà par un espace commun, et qui ne nous a pas bloqué.
 */
import { supabase, SharedSpace, SharedMovie, getSpaceMovies } from './supabase';
import { Movie, MovieFormData } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import type { SocialKind, PlanPayload } from '../supabase/functions/notify/messages.ts';
import { formatSlot } from '../supabase/functions/notify/messages.ts';
import type { SlotDraft } from './plans';

export type ShareKind = 'watch' | 'verdict';

export interface Companion {
  profile_id: string;
  first_name: string;
  avatar_url: string | null;
  shared_spaces: number;
}

export interface SocialNotification {
  id: string;
  kind: SocialKind;
  actor_id: string | null;
  space_id: string | null;
  shared_movie_id: string | null;
  share_link_id: string | null;
  title: string;
  poster_url: string | null;
  guest_name: string | null;
  rating: number | string | null;
  plan_id?: string | null;
  payload?: PlanPayload | null;
  created_at: string;
  read_at: string | null;
  actor?: { first_name: string | null; avatar_url: string | null } | null;
}

export interface SocialResult<T> {
  data: T | null;
  error?: string;
}

type ShareableMovie = Pick<
  Movie,
  | 'tmdbId'
  | 'title'
  | 'director'
  | 'year'
  | 'genre'
  | 'posterUrl'
  | 'review'
  | 'runtime'
  | 'releaseDate'
  | 'actors'
  | 'mediaType'
  | 'numberOfSeasons'
  | 'tmdbRating'
  | 'seasonNumber'
  | 'ratings'
  | 'adaptiveRating'
  | 'comment'
>;

/**
 * Seule une œuvre entière se partage : un film ou une série. Une saison n'a pas
 * sa place dans un espace, qui ne les distingue pas.
 */
export const canShare = (movie: Partial<ShareableMovie> | null | undefined): boolean =>
  !!movie && !!movie.tmdbId && movie.seasonNumber == null && !!movie.title;

/** Un verdict se demande seulement sur une œuvre effectivement notée. */
export const hasRating = (movie: Partial<ShareableMovie> | null | undefined): boolean => {
  const r = movie?.ratings;
  return !!r && (r.story > 0 || r.visuals > 0 || r.acting > 0 || r.sound > 0);
};

const moviePayload = (movie: ShareableMovie, backdropUrl?: string | null) => ({
  tmdb_id: movie.tmdbId,
  media_type: movie.mediaType === 'tv' ? 'tv' : 'movie',
  title: movie.title,
  director: movie.director,
  year: movie.year,
  genre: movie.genre,
  poster_url: movie.posterUrl || null,
  backdrop_url: backdropUrl || null,
  // Dans `Movie`, `review` porte le synopsis TMDB ; l'avis personnel est `comment`.
  synopsis: movie.review || null,
  runtime: movie.runtime || null,
  release_date: movie.releaseDate || null,
  actors: movie.actors || null,
  number_of_seasons: movie.numberOfSeasons || null,
  tmdb_rating: movie.tmdbRating || null,
});

const ratingPayload = (movie: ShareableMovie) => ({
  story: Number(movie.ratings?.story) || 0,
  visuals: Number(movie.ratings?.visuals) || 0,
  acting: Number(movie.ratings?.acting) || 0,
  sound: Number(movie.ratings?.sound) || 0,
  adaptive_rating: movie.adaptiveRating ?? null,
  rating_mode: movie.adaptiveRating ? 'bitter_plus' : 'bitter',
  review: movie.comment || null,
});

/** Le serveur lève des codes courts ; on les traduit en phrases. */
const MESSAGES: Record<string, string> = {
  'not-authenticated': 'Connecte-toi pour proposer un film.',
  'invitee-not-allowed': 'Cette personne ne fait plus partie de tes espaces.',
  'rate-limited': 'Tu as beaucoup proposé aujourd’hui. Réessaie demain.',
  'too-many-invitees': 'Huit personnes au plus à la fois.',
  'no-invitee': 'Choisis au moins une personne.',
  'link-not-found': 'Ce lien n’existe plus.',
  'link-expired': 'Ce lien a expiré.',
  blocked: 'Ce lien ne peut pas être ouvert.',
  'rating-required': 'Note d’abord le film.',
};

const readError = (error: unknown): string => {
  const raw = (error as { message?: string })?.message ?? '';
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/failed to fetch|load failed|network/i.test(raw)) return 'Connexion perdue. Réessaie.';
  console.warn('[Social]', raw, error);
  return 'Ça n’a pas marché. Réessaie dans un instant.';
};

/** Grand fond de la fiche TMDB, pour l'aperçu du lien dans WhatsApp. Facultatif. */
const fetchBackdrop = async (tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> => {
  if (!TMDB_API_KEY) return null;
  try {
    const res = await fetch(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
    const data = await res.json();
    return data?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null;
  } catch {
    return null;
  }
};

export async function getCompanions(): Promise<SocialResult<Companion[]>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('get_watch_companions');
  if (error) return { data: null, error: readError(error) };
  return { data: (data || []) as Companion[] };
}

export async function proposeToPeople(
  kind: ShareKind,
  movie: ShareableMovie,
  invitees: string[],
  slots: SlotDraft[] = []
): Promise<SocialResult<{ space_id: string; shared_movie_id: string; sent: number }>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('propose_to_people', {
    p_kind: kind,
    p_movie: moviePayload(movie),
    p_invitees: invitees,
    p_rating: kind === 'verdict' ? ratingPayload(movie) : null,
    p_slots: kind === 'watch' && slots.length ? slots : null,
  });
  if (error) return { data: null, error: readError(error) };
  return { data };
}

/**
 * Adresse publique des liens. Toujours le vrai domaine en production : c'est lui
 * qui ouvre l'app Android installée, et lui que WhatsApp sait prévisualiser.
 */
const linkOrigin = () => {
  const { origin, protocol, hostname } = window.location;
  if (protocol === 'https:' && hostname !== 'localhost') return origin;
  return 'https://thebitter.watch';
};

export async function createShareLink(
  kind: ShareKind,
  movie: ShareableMovie,
  slots: SlotDraft[] = []
): Promise<SocialResult<{ url: string; token: string }>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const backdrop = movie.tmdbId ? await fetchBackdrop(movie.tmdbId, movie.mediaType === 'tv' ? 'tv' : 'movie') : null;
  const { data, error } = await supabase.rpc('create_share_link', {
    p_kind: kind,
    p_movie: moviePayload(movie, backdrop),
    p_rating: kind === 'verdict' ? ratingPayload(movie) : null,
    p_slots: kind === 'watch' && slots.length ? slots : null,
  });
  if (error || typeof data !== 'string') return { data: null, error: readError(error) };
  return { data: { token: data, url: `${linkOrigin()}/i/${data}` } };
}

/**
 * Le texte part du téléphone de la personne qui invite, dans SA conversation :
 * il est écrit à la première personne et ne parle pas de l'app. L'aperçu du
 * lien fait le reste.
 */
export const shareText = (kind: ShareKind, title: string, slots: SlotDraft[] = []): string => {
  if (kind === 'verdict') return `T’as vu ${title} ? Je l’ai noté, devine combien 👀 Donne ta note pour voir la mienne 👉`;
  if (slots.length === 1) return `On se fait ${title} ${formatSlot(slots[0])} ? Dis-moi si ça te dit 👉`;
  if (slots.length > 1) return `On se fait ${title} ? J’ai proposé ${slots.length} créneaux, choisis celui qui te va 👉`;
  return `On se fait ${title} ensemble ? Dis-moi si ça te dit 👉`;
};

/**
 * Ouvre le partage du téléphone, ou copie le message à défaut.
 * Rend 'shared', 'copied', ou 'cancelled' quand la personne a refermé le partage.
 */
export async function shareLink(
  kind: ShareKind,
  title: string,
  url: string,
  slots: SlotDraft[] = []
): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = `${shareText(kind, title, slots)} ${url}`;
  if (typeof navigator.share === 'function') {
    try {
      // Tout dans `text` : plusieurs messageries ignorent le champ `url` quand un
      // texte l'accompagne, et le lien disparaîtrait du message.
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ─── Lien reçu : rattachement au compte ─────────────────────────────────────

const PENDING_KEY = 'bitter_pending_invite';
const GUEST_KEY = 'bitter_guest_key';

export interface PendingInvite {
  token: string;
  guestKey: string | null;
  at: number;
}

export const isShareToken = (value: string | null | undefined): value is string =>
  !!value && /^[A-Za-z0-9_-]{22}$/.test(value);

export function savePendingInvite(token: string): void {
  try {
    const guestKey = localStorage.getItem(GUEST_KEY);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ token, guestKey, at: Date.now() }));
  } catch {
    // Stockage indisponible : le lien reste dans l'URL le temps de la session.
  }
}

/** Invitation en attente, posée par la page du lien ou par `?invite=`. Trente jours au plus. */
export function readPendingInvite(): PendingInvite | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingInvite;
    if (!isShareToken(parsed?.token)) return null;
    if (Date.now() - Number(parsed.at || 0) > 30 * 24 * 3600 * 1000) return null;
    return { ...parsed, guestKey: parsed.guestKey || localStorage.getItem(GUEST_KEY) };
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // rien à faire
  }
}

export interface InvitePreview {
  kind: ShareKind;
  inviter: string;
  title: string;
  poster_url: string | null;
  expired: boolean;
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_share_link', { p_token: token });
  if (error || !data) return null;
  return data as InvitePreview;
}

export interface ClaimResult {
  own?: boolean;
  space_id?: string;
  shared_movie_id?: string;
  kind: ShareKind;
  title: string;
  guest_rating?: number | string | null;
  interested?: boolean | null;
}

export async function claimInvite(invite: PendingInvite): Promise<SocialResult<ClaimResult>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('claim_share_link', {
    p_token: invite.token,
    p_guest_key: invite.guestKey,
  });
  if (error) return { data: null, error: readError(error) };
  return { data: data as ClaimResult };
}

/** L'espace et le film, pour ouvrir l'un sur l'autre après un rattachement ou une notification. */
export async function loadSpaceAndMovie(
  spaceId: string,
  sharedMovieId?: string | null
): Promise<{ space: SharedSpace; movie: SharedMovie | null } | null> {
  if (!supabase) return null;
  const { data: space } = await supabase.from('shared_spaces').select('*').eq('id', spaceId).maybeSingle();
  if (!space) return null;
  if (!sharedMovieId) return { space: space as SharedSpace, movie: null };
  const movies = await getSpaceMovies(spaceId);
  return { space: space as SharedSpace, movie: movies.data.find((m) => m.id === sharedMovieId) ?? null };
}

/**
 * Répondre à une proposition : « ça me dit » ou « pas cette fois ».
 *
 * Écriture directe plutôt que `setMovieVote`, qui annule un vote identique déjà
 * posé : répondre « oui » deux fois ne doit jamais retirer le oui. Le serveur
 * prévient la personne qui a proposé, et range l'invitation comme lue.
 */
export async function answerWatchInvite(sharedMovieId: string, userId: string, interested: boolean): Promise<SocialResult<true>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const { error } = await supabase
    .from('space_movie_votes')
    .upsert({ movie_id: sharedMovieId, profile_id: userId, interested }, { onConflict: 'movie_id,profile_id' });
  if (error) return { data: null, error: readError(error) };
  return { data: true };
}

export interface CommonWish {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  profile_id: string;
  first_name: string;
  avatar_url: string | null;
}

/** Clé d'un film dans la table des envies communes. */
export const wishKey = (mediaType: string | undefined, tmdbId: number | undefined) => `${mediaType === 'tv' ? 'tv' : 'movie'}:${tmdbId}`;

/** Pour chaque film de ma liste, les proches qui l'ont aussi dans la leur. */
export async function getCommonWishes(): Promise<Map<string, CommonWish[]>> {
  const map = new Map<string, CommonWish[]>();
  if (!supabase) return map;
  const { data, error } = await supabase.rpc('get_common_wishes');
  if (error) {
    console.warn('[Social] Envies communes illisibles', error);
    return map;
  }
  for (const row of (data || []) as CommonWish[]) {
    const key = wishKey(row.media_type, row.tmdb_id);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

// ─── Boîte de notifications ─────────────────────────────────────────────────

export async function getNotifications(limit = 40): Promise<SocialResult<SocialNotification[]>> {
  if (!supabase) return { data: null, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(first_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: readError(error) };
  return { data: (data || []) as SocialNotification[] };
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
  if (error) console.warn('[Social] Lecture non enregistrée', error);
}

/** Temps réel : rappelle `onChange` à chaque notification reçue ou modifiée. */
export function subscribeToNotifications(userId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

/** Film de la fiche d'ajout, sous la forme attendue par le partage. */
export const asShareable = (movie: Movie | MovieFormData): ShareableMovie => movie as ShareableMovie;
