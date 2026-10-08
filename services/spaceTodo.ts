/**
 * « À toi de jouer » : ce qu'un espace attend de moi.
 *
 * POURQUOI CE MODULE EXISTE
 * Dans un espace, chaque geste demandait trois appuis : l'onglet, la carte à
 * déplier, le bouton. Et rien ne disait ce qui attendait une réponse : il
 * fallait parcourir les listes pour le deviner. On calcule donc, film par film,
 * ce que le groupe attend de moi, pour le présenter en cartes réglées d'un geste
 * dans l'espace, et en pastille sur la bulle de l'espace à l'accueil.
 *
 * Trois sortes de demandes, dans cet ordre (la plus pressée d'abord) :
 * - `plan` : une séance proposée par quelqu'un d'autre, où je suis invité ;
 * - `watch` : un film proposé par quelqu'un d'autre, sur lequel je n'ai rien dit ;
 * - `rate` : un film vu, que je n'ai pas noté dans l'espace, et dont on sait que
 *   je l'ai vu ou voulu voir (noté seul, « partant », ou séance calée avec moi).
 *   Sans cette condition, on demanderait de noter des films jamais vus.
 */
import { supabase, SharedMovie } from './supabase';
import { WatchPlan, getSpacePlans } from './plans';
import { Movie } from '../types';
import { lastReminders } from './voteReminders';
import { hasVerdict } from '../utils/rating';

export type TodoKind = 'plan' | 'watch' | 'rate';

export interface TodoItem {
  /** Stable d'un chargement à l'autre : sert à écarter une demande. */
  key: string;
  kind: TodoKind;
  movie: SharedMovie;
  plan?: WatchPlan;
  /** Ma fiche personnelle quand j'ai déjà noté le film seul. */
  mine?: Movie;
}

type VoteLike = { movie_id: string; profile_id: string; interested: boolean };
type RatingLike = { movie_id: string; profile_id: string };

const workKeyOf = (mediaType: string | null | undefined, tmdbId: number | null | undefined) =>
  `${mediaType === 'tv' ? 'tv' : 'movie'}:${tmdbId}`;

/** Mes verdicts personnels, par œuvre entière. */
export const personalVerdicts = (myMovies: Movie[]): Map<string, Movie> => {
  const map = new Map<string, Movie>();
  for (const m of myMovies) {
    if (m.tmdbId == null || m.seasonNumber != null || m.status !== 'watched' || !hasVerdict(m)) continue;
    map.set(workKeyOf(m.mediaType, m.tmdbId), m);
  }
  return map;
};

const isUpcoming = (plan: WatchPlan) => plan.slots.some((s) => new Date(s.starts_at).getTime() > Date.now());

export function buildTodo(input: {
  movies: SharedMovie[];
  votes: VoteLike[];
  ratings: RatingLike[];
  plans: WatchPlan[];
  userId: string;
  personal: Map<string, Movie>;
  skipped?: Set<string>;
  blocked?: Set<string>;
}): TodoItem[] {
  const { movies, votes, ratings, plans, userId, personal, skipped, blocked } = input;
  if (!userId) return [];
  const byId = new Map(movies.map((m) => [m.id, m]));
  const myVote = new Map(votes.filter((v) => v.profile_id === userId).map((v) => [v.movie_id, v.interested]));
  const rated = new Set(ratings.filter((r) => r.profile_id === userId).map((r) => r.movie_id));
  const newest = (a: TodoItem, b: TodoItem) => (b.movie.added_at ?? '').localeCompare(a.movie.added_at ?? '');

  const planItems: TodoItem[] = [];
  /** Séance calée avec moi : j'ai vu le film, ou je vais le voir. */
  const planned = new Set<string>();
  /** Séance que j'ai proposée ou acceptée : demander « partant ? » n'aurait pas de sens. */
  const involved = new Set<string>();
  for (const plan of plans) {
    const movie = plan.shared_movie_id ? byId.get(plan.shared_movie_id) : undefined;
    if (!movie) continue;
    if (plan.status === 'agreed' && plan.participant_ids.includes(userId)) {
      planned.add(movie.id);
      involved.add(movie.id);
    }
    if (plan.proposer_id === userId) involved.add(movie.id);
    if (
      plan.status === 'open' &&
      plan.proposer_id !== userId &&
      plan.participant_ids.includes(userId) &&
      !blocked?.has(plan.proposer_id) &&
      isUpcoming(plan)
    ) {
      planItems.push({ key: `plan:${plan.id}`, kind: 'plan', movie, plan });
    }
  }
  const withPlan = new Set(planItems.map((i) => i.movie.id));

  const watchItems: TodoItem[] = [];
  const rateItems: TodoItem[] = [];
  for (const movie of movies) {
    if (withPlan.has(movie.id)) continue;
    const mine = movie.tmdb_id != null ? personal.get(workKeyOf(movie.media_type, movie.tmdb_id)) : undefined;
    if (movie.status === 'watchlist') {
      if (movie.added_by === userId || myVote.has(movie.id) || involved.has(movie.id)) continue;
      if (movie.added_by && blocked?.has(movie.added_by)) continue;
      watchItems.push({ key: `watch:${movie.id}`, kind: 'watch', movie, mine });
    } else if (!rated.has(movie.id) && (mine || myVote.get(movie.id) === true || planned.has(movie.id))) {
      rateItems.push({ key: `rate:${movie.id}`, kind: 'rate', movie, mine });
    }
  }

  return [...planItems, ...watchItems.sort(newest), ...rateItems.sort(newest)].filter(
    (item) => !skipped?.has(item.key)
  );
}

// ─── Demandes écartées ──────────────────────────────────────────────────────
// « Pas vu », « Pas dispo » : la demande ne revient pas. Gardé sur l'appareil,
// par compte ; c'est un confort d'affichage, pas une réponse au groupe.

const skipKey = (userId: string) => `bitter_space_todo_skip:${userId}`;

export function readSkipped(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(skipKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function skipTodo(userId: string, key: string): void {
  try {
    const next = [...readSkipped(userId), key].slice(-300);
    localStorage.setItem(skipKey(userId), JSON.stringify(next));
  } catch {
    // Stockage indisponible : la demande reviendra au prochain chargement.
  }
}

// ─── Propositions gardées ───────────────────────────────────────────────────
// « Toujours d'actualité ? » → « Garder » : la question ne revient pas avant 30
// jours. Gardé sur l'appareil, par compte ; « Retirer », lui, agit sur l'espace.
const keptKey = (userId: string) => `bitter_space_kept:${userId}`;
const STALE_DAYS = 30;
const DAY = 86_400_000;

function readKept(userId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(keptKey(userId)) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function keepProposal(userId: string, movieId: string): void {
  try {
    localStorage.setItem(keptKey(userId), JSON.stringify({ ...readKept(userId), [movieId]: Date.now() }));
  } catch {
    // Stockage indisponible : la question reviendra.
  }
}

/** Une proposition « à voir » à laquelle d'autres membres n'ont pas répondu. */
export interface WaitingItem {
  movie: SharedMovie;
  /** Membres actifs (ni moi, ni qui a proposé) qui n'ont pas répondu. */
  missing: string[];
  /** Jours depuis la proposition. */
  ageDays: number;
}

/** Ce que le billet d'un espace montre à l'accueil. */
export interface SpaceOverview {
  /** Demandes qui m'attendent (voir `buildTodo`). */
  pending: number;
  /** Parmi elles, les films à voter : la carte « À toi de voter » de l'accueil. */
  toVote: TodoItem[];
  /** Ce que le groupe attend des autres : le talon orange de celui qui attend. */
  waiting: WaitingItem[];
  /** Mes propositions sans aucune réponse depuis 30 jours : « Toujours d'actualité ? ». */
  stale: WaitingItem[];
  /** Dernière relance par `${movieId}:${profileId}`. */
  reminded: Map<string, Date>;
  /** Qui a voté quoi, film par film : sert à dire qui manque encore. */
  votedBy: Map<string, Set<string>>;
  /** Les trois dernières affiches de l'espace, la plus récente d'abord. */
  posters: string[];
  /** Membres actifs, les autres d'abord, moi en dernier. */
  members: { profile_id: string; first_name: string; avatar_url: string | null }[];
}

/**
 * L'aperçu de chacun de mes espaces, pour les billets de l'accueil. Cinq
 * lectures pour tous les espaces à la fois ; la RLS ne rend que ceux dont je
 * suis membre actif, et les profils de ceux qui les partagent avec moi.
 */
export async function loadSpaceOverview(userId: string, myMovies: Movie[]): Promise<Map<string, SpaceOverview>> {
  const overview = new Map<string, SpaceOverview>();
  if (!supabase || !userId) return overview;
  const [moviesRes, votesRes, ratingsRes, plans, membersRes] = await Promise.all([
    supabase
      .from('shared_movies')
      .select('id, space_id, status, added_by, tmdb_id, media_type, added_at, title, poster_url, synopsis')
      .order('added_at', { ascending: false }),
    // Les votes de tout le groupe : la RLS ne rend que ceux de mes espaces.
    supabase.from('space_movie_votes').select('movie_id, profile_id, interested'),
    supabase.from('movie_ratings').select('movie_id, profile_id').eq('profile_id', userId),
    getSpacePlans(),
    supabase
      .from('space_members')
      .select('space_id, profile_id, profile:profiles(first_name, avatar_url)')
      .eq('is_active', true),
  ]);
  if (moviesRes.error) return overview;

  const entry = (spaceId: string): SpaceOverview => {
    let e = overview.get(spaceId);
    if (!e) {
      e = { pending: 0, toVote: [], waiting: [], stale: [], reminded: new Map(), votedBy: new Map(), posters: [], members: [] };
      overview.set(spaceId, e);
    }
    return e;
  };

  const bySpace = new Map<string, SharedMovie[]>();
  for (const m of (moviesRes.data || []) as SharedMovie[]) {
    bySpace.set(m.space_id, [...(bySpace.get(m.space_id) ?? []), m]);
    const e = entry(m.space_id);
    if (m.poster_url && e.posters.length < 3) e.posters.push(m.poster_url);
  }
  const personal = personalVerdicts(myMovies);
  const skipped = readSkipped(userId);
  const votes = (votesRes.data || []) as VoteLike[];
  const votedBy = new Map<string, Set<string>>();
  for (const v of votes) votedBy.set(v.movie_id, new Set([...(votedBy.get(v.movie_id) ?? []), v.profile_id]));
  for (const [spaceId, movies] of bySpace) {
    const todo = buildTodo({
      movies,
      votes,
      ratings: (ratingsRes.data || []) as RatingLike[],
      plans: plans.filter((p) => p.space_id === spaceId),
      userId,
      personal,
      skipped,
    });
    const e = entry(spaceId);
    e.pending = todo.length;
    e.toVote = todo.filter((i) => i.kind === 'watch');
    e.votedBy = votedBy;
  }
  type MemberRow = {
    space_id: string;
    profile_id: string;
    profile: { first_name: string | null; avatar_url: string | null } | { first_name: string | null; avatar_url: string | null }[] | null;
  };
  for (const row of (membersRes.data || []) as MemberRow[]) {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    entry(row.space_id).members.push({
      profile_id: row.profile_id,
      first_name: profile?.first_name || '',
      avatar_url: profile?.avatar_url ?? null,
    });
  }
  for (const e of overview.values()) {
    e.members.sort((a, b) => Number(a.profile_id === userId) - Number(b.profile_id === userId));
  }

  // Qui le groupe attend encore, proposition par proposition.
  const kept = readKept(userId);
  const now = Date.now();
  for (const [spaceId, movies] of bySpace) {
    const e = entry(spaceId);
    for (const movie of movies) {
      if (movie.status !== 'watchlist') continue;
      const voted = votedBy.get(movie.id) ?? new Set<string>();
      const missing = e.members
        .map((m) => m.profile_id)
        .filter((id) => id !== userId && id !== movie.added_by && !voted.has(id));
      const ageDays = Math.floor((now - new Date(movie.added_at).getTime()) / DAY);
      if (missing.length) e.waiting.push({ movie, missing, ageDays });
      const othersVoted = [...voted].some((id) => id !== movie.added_by);
      const keptAt = kept[movie.id] ?? 0;
      if (movie.added_by === userId && !othersVoted && ageDays >= STALE_DAYS && now - keptAt > STALE_DAYS * DAY) {
        e.stale.push({ movie, missing, ageDays });
      }
    }
  }
  const waitingIds = [...overview.values()].flatMap((e) => e.waiting.map((w) => w.movie.id));
  const reminded = await lastReminders(waitingIds);
  for (const e of overview.values()) e.reminded = reminded;
  return overview;
}

/**
 * L'état du talon d'un billet, du plus pressant au plus calme :
 * - `me` : on m'attend ;
 * - `stale` : une de mes propositions n'a eu aucune réponse en 30 jours ;
 * - `wait` / `waitReminded` : j'ai fait ma part, d'autres non (relancés il y a
 *   moins de 5 jours pour le second) ;
 * - `ok` : plus personne ne doit rien.
 */
export type StubState = 'me' | 'stale' | 'wait' | 'waitReminded' | 'ok';

export function stubStateOf(e: SpaceOverview | undefined): StubState {
  if (!e) return 'ok';
  if (e.pending > 0) return 'me';
  if (e.stale.length) return 'stale';
  if (!e.waiting.length) return 'ok';
  const fresh = (movieId: string, target: string) => {
    const at = e.reminded.get(`${movieId}:${target}`);
    return !!at && Date.now() - at.getTime() < 5 * DAY;
  };
  return e.waiting.every((w) => w.missing.every((id) => fresh(w.movie.id, id))) ? 'waitReminded' : 'wait';
}

/** Les membres qui manquent, toutes propositions confondues, dans l'ordre d'apparition. */
export const missingMembers = (e: SpaceOverview): string[] => [...new Set(e.waiting.flatMap((w) => w.missing))];
