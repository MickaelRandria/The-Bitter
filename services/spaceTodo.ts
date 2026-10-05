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

/**
 * Le nombre de demandes en attente, espace par espace, pour les bulles de
 * l'accueil. Quatre lectures pour tous mes espaces à la fois ; la RLS ne rend
 * que ceux dont je suis membre actif.
 */
export async function loadTodoCounts(userId: string, myMovies: Movie[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!supabase || !userId) return counts;
  const [moviesRes, votesRes, ratingsRes, plans] = await Promise.all([
    supabase.from('shared_movies').select('id, space_id, status, added_by, tmdb_id, media_type, added_at, title'),
    supabase.from('space_movie_votes').select('movie_id, profile_id, interested').eq('profile_id', userId),
    supabase.from('movie_ratings').select('movie_id, profile_id').eq('profile_id', userId),
    getSpacePlans(),
  ]);
  if (moviesRes.error) return counts;

  const bySpace = new Map<string, SharedMovie[]>();
  for (const m of (moviesRes.data || []) as SharedMovie[]) {
    bySpace.set(m.space_id, [...(bySpace.get(m.space_id) ?? []), m]);
  }
  const personal = personalVerdicts(myMovies);
  const skipped = readSkipped(userId);
  for (const [spaceId, movies] of bySpace) {
    const items = buildTodo({
      movies,
      votes: (votesRes.data || []) as VoteLike[],
      ratings: (ratingsRes.data || []) as RatingLike[],
      plans: plans.filter((p) => p.space_id === spaceId),
      userId,
      personal,
      skipped,
    });
    if (items.length) counts.set(spaceId, items.length);
  }
  return counts;
}
