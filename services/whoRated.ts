import { supabase, type MovieRating, type SharedMovie } from './supabase';
import { ratingValue } from '../utils/verdict';

/**
 * « Qui a mis cette note ? », dans un espace : un film, la note d'un membre
 * (et son commentaire), quatre membres au choix.
 *
 * On ne devine jamais ses propres notes, mais on peut se choisir comme leurre.
 * Deux membres qui ont mis la même note au film ont raison tous les deux. Pour
 * raisonner plutôt que deviner, chaque membre proposé montre sa moyenne dans
 * l'espace et sa façon de noter (`memberTastes`).
 *
 * Le meilleur score de chacun va dans `who_rated_scores` (migration
 * 20261102_qui_a_note). Sans la table, le jeu marche, sans record.
 */

export const WHO_QUESTION_COUNT = 8;
/** En dessous, la partie tournerait court. */
export const WHO_MIN_QUESTIONS = 3;
/** Écart à la moyenne du groupe au-delà duquel on note « large » ou « sévère ». */
const LEAN = 0.5;

export type Lean = 'large' | 'severe' | 'even';

export interface Taste {
  avg: number;
  count: number;
  lean: Lean;
}

export interface WhoQuestion<P extends { id: string }> {
  movie: SharedMovie;
  rating: MovieRating;
  value: number;
  answer: P;
  options: P[];
  /** Les notes de tous les membres pour ce film, de la plus basse à la plus haute. */
  all: { person: P; value: number }[];
}

export interface WhoScore {
  profileId: string;
  score: number;
  total: number;
  createdAt: string;
}

const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Une note affichée : arrondie au dixième, comme partout dans l'app. */
export const sameNote = (a: number, b: number) => Math.round(a * 10) === Math.round(b * 10);

/** Les notes des autres qu'on peut faire deviner : un film connu, un membre connu. */
export function whoCandidates(
  movies: SharedMovie[],
  ratings: MovieRating[],
  people: { id: string }[],
  currentUserId: string
): MovieRating[] {
  const movieIds = new Set(movies.map((m) => m.id));
  const peopleIds = new Set(people.map((p) => p.id));
  return ratings.filter((r) => r.profile_id !== currentUserId && movieIds.has(r.movie_id) && peopleIds.has(r.profile_id));
}

/** La moyenne de chaque membre dans l'espace, comparée à celle du groupe. */
export function memberTastes(ratings: MovieRating[]): Map<string, Taste> {
  const sums = new Map<string, { sum: number; count: number }>();
  let total = 0;
  for (const r of ratings) {
    const value = ratingValue(r);
    total += value;
    const entry = sums.get(r.profile_id) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    sums.set(r.profile_id, entry);
  }
  const group = ratings.length ? total / ratings.length : 0;
  const tastes = new Map<string, Taste>();
  sums.forEach(({ sum, count }, id) => {
    const avg = sum / count;
    tastes.set(id, { avg, count, lean: avg - group > LEAN ? 'large' : group - avg > LEAN ? 'severe' : 'even' });
  });
  return tastes;
}

/** Une note par film d'abord, pour varier ; puis d'autres notes si les films manquent. */
export function buildWhoQuestions<P extends { id: string }>(
  movies: SharedMovie[],
  ratings: MovieRating[],
  people: P[],
  currentUserId: string
): WhoQuestion<P>[] {
  const pool = shuffle(whoCandidates(movies, ratings, people, currentUserId));
  const seenMovies = new Set<string>();
  const first = pool.filter((r) => {
    if (seenMovies.has(r.movie_id)) return false;
    seenMovies.add(r.movie_id);
    return true;
  });
  const picked = [...first, ...pool.filter((r) => !first.includes(r))].slice(0, WHO_QUESTION_COUNT);

  return picked.map((rating) => {
    const movie = movies.find((m) => m.id === rating.movie_id)!;
    const answer = people.find((p) => p.id === rating.profile_id)!;
    const options = shuffle([answer, ...shuffle(people.filter((p) => p.id !== answer.id)).slice(0, 3)]);
    const all = ratings
      .filter((r) => r.movie_id === movie.id)
      .map((r) => ({ person: people.find((p) => p.id === r.profile_id), value: ratingValue(r) }))
      .filter((row): row is { person: P; value: number } => !!row.person)
      .sort((a, b) => a.value - b.value);
    return { movie, rating, value: ratingValue(rating), answer, options, all };
  });
}

/** Juste si ce membre a mis cette note-là au film, même s'il n'est pas l'auteur tiré. */
export const isWhoRight = <P extends { id: string }>(question: WhoQuestion<P>, personId: string) =>
  question.all.some((row) => row.person.id === personId && sameNote(row.value, question.value));

export async function saveWhoScore(spaceId: string, profileId: string, score: number, total: number): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('who_rated_scores').insert({ space_id: spaceId, profile_id: profileId, score, total });
  return !error;
}

/** La meilleure partie de chaque membre, en proportion, la plus ancienne départage. */
export async function getWhoLeaderboard(spaceId: string): Promise<WhoScore[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('who_rated_scores')
    .select('profile_id, score, total, created_at')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error || !data) return [];
  const ratio = (s: WhoScore) => s.score / Math.max(1, s.total);
  const best = new Map<string, WhoScore>();
  for (const row of data) {
    const entry: WhoScore = { profileId: row.profile_id, score: row.score, total: row.total, createdAt: row.created_at };
    const known = best.get(row.profile_id);
    if (!known || ratio(entry) > ratio(known)) best.set(row.profile_id, entry);
  }
  return [...best.values()].sort((a, b) => ratio(b) - ratio(a) || a.createdAt.localeCompare(b.createdAt));
}
