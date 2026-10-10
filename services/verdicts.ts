/**
 * Ce qui entoure un verdict d'espace : « pas vu », paris, réactions, débat,
 * relances et date du verdict.
 *
 * Tables de la migration 20261010_verdicts_des_espaces. Tant qu'elle n'est pas
 * passée, chaque lecture échoue proprement et rend une liste vide : l'espace
 * s'affiche comme avant, sans ces compléments.
 */
import { supabase } from './supabase';

export interface MovieSkip {
  movie_id: string;
  profile_id: string;
}

export interface VerdictGuess {
  movie_id: string;
  guesser_id: string;
  target_id: string;
  guess: number;
}

export const REACTIONS = ['😂', '🔥', '🤝', '🙄'] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export interface ReviewReaction {
  rating_id: string;
  profile_id: string;
  emoji: ReactionEmoji;
}

export interface DebateMessage {
  id: string;
  movie_id: string;
  profile_id: string;
  body: string;
  created_at: string;
}

export interface VerdictExtras {
  skips: MovieSkip[];
  guesses: VerdictGuess[];
  reactions: ReviewReaction[];
  messages: DebateMessage[];
  /** Film → date à laquelle le verdict est tombé. */
  completed: Map<string, string>;
  /** `${movieId}:${targetId}` → date de la dernière relance de note. */
  reminders: Map<string, Date>;
}

export const emptyExtras = (): VerdictExtras => ({
  skips: [],
  guesses: [],
  reactions: [],
  messages: [],
  completed: new Map(),
  reminders: new Map(),
});

/** Délai minimal entre deux relances de note d'une même personne sur un même film. */
export const RATING_REMINDER_DAYS = 5;

/** Longueur maximale d'un message du débat, comme la contrainte en base. */
export const DEBATE_MAX = 160;

const rows = async <T>(label: string, query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> => {
  const { data, error } = await query;
  if (error) {
    console.warn(`[Verdicts] ${label} :`, error.message);
    return [];
  }
  return (data ?? []) as T[];
};

export async function loadVerdictExtras(spaceId: string): Promise<VerdictExtras> {
  if (!supabase) return emptyExtras();
  const [skips, guesses, reactions, messages, verdicts, reminders] = await Promise.all([
    rows<MovieSkip>(
      'pas vus',
      supabase.from('space_movie_skips').select('movie_id, profile_id, shared_movies!inner(space_id)').eq('shared_movies.space_id', spaceId)
    ),
    rows<VerdictGuess>(
      'paris',
      supabase
        .from('verdict_guesses')
        .select('movie_id, guesser_id, target_id, guess, shared_movies!inner(space_id)')
        .eq('shared_movies.space_id', spaceId)
    ),
    rows<ReviewReaction>(
      'réactions',
      supabase
        .from('review_reactions')
        .select('rating_id, profile_id, emoji, movie_ratings!inner(shared_movies!inner(space_id))')
        .eq('movie_ratings.shared_movies.space_id', spaceId)
    ),
    rows<DebateMessage>(
      'débat',
      supabase
        .from('verdict_messages')
        .select('id, movie_id, profile_id, body, created_at, shared_movies!inner(space_id)')
        .eq('shared_movies.space_id', spaceId)
        .order('created_at', { ascending: true })
    ),
    rows<{ movie_id: string; completed_at: string }>(
      'verdicts',
      supabase.from('space_verdicts').select('movie_id, completed_at, shared_movies!inner(space_id)').eq('shared_movies.space_id', spaceId)
    ),
    rows<{ shared_movie_id: string; target_id: string; created_at: string }>(
      'relances',
      supabase
        .from('rating_reminders')
        .select('shared_movie_id, target_id, created_at, shared_movies!inner(space_id)')
        .eq('shared_movies.space_id', spaceId)
        .order('created_at', { ascending: false })
    ),
  ]);

  const reminderMap = new Map<string, Date>();
  for (const r of reminders) {
    const key = `${r.shared_movie_id}:${r.target_id}`;
    if (!reminderMap.has(key)) reminderMap.set(key, new Date(r.created_at));
  }
  return {
    skips: skips.map(({ movie_id, profile_id }) => ({ movie_id, profile_id })),
    guesses: guesses.map(({ movie_id, guesser_id, target_id, guess }) => ({ movie_id, guesser_id, target_id, guess: Number(guess) })),
    reactions: reactions.map(({ rating_id, profile_id, emoji }) => ({ rating_id, profile_id, emoji })),
    messages: messages.map(({ id, movie_id, profile_id, body, created_at }) => ({ id, movie_id, profile_id, body, created_at })),
    completed: new Map(verdicts.map((v) => [v.movie_id, v.completed_at])),
    reminders: reminderMap,
  };
}

type Write = { ok: boolean; error?: string };
const UNAVAILABLE: Write = { ok: false, error: 'Sauvegarde en ligne indisponible' };

export async function setSkipped(movieId: string, userId: string, skipped: boolean): Promise<Write> {
  if (!supabase) return UNAVAILABLE;
  const { error } = skipped
    ? await supabase.from('space_movie_skips').insert({ movie_id: movieId, profile_id: userId })
    : await supabase.from('space_movie_skips').delete().eq('movie_id', movieId).eq('profile_id', userId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function placeGuess(movieId: string, userId: string, targetId: string, guess: number): Promise<Write> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase
    .from('verdict_guesses')
    .upsert(
      { movie_id: movieId, guesser_id: userId, target_id: targetId, guess, updated_at: new Date().toISOString() },
      { onConflict: 'movie_id,guesser_id,target_id' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setReaction(ratingId: string, userId: string, emoji: ReactionEmoji, on: boolean): Promise<Write> {
  if (!supabase) return UNAVAILABLE;
  const { error } = on
    ? await supabase.from('review_reactions').insert({ rating_id: ratingId, profile_id: userId, emoji })
    : await supabase.from('review_reactions').delete().eq('rating_id', ratingId).eq('profile_id', userId).eq('emoji', emoji);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function postDebate(movieId: string, userId: string, body: string): Promise<Write> {
  if (!supabase) return UNAVAILABLE;
  const text = body.trim().slice(0, DEBATE_MAX);
  if (!text) return { ok: false };
  const { error } = await supabase.from('verdict_messages').insert({ movie_id: movieId, profile_id: userId, body: text });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteDebate(id: string): Promise<Write> {
  if (!supabase) return UNAVAILABLE;
  const { error } = await supabase.from('verdict_messages').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type RatingReminderStatus = 'sent' | 'too_soon' | 'already_rated' | 'not_expected';

export async function remindRating(
  movieId: string,
  targets: string[],
  channel: 'push' | 'message'
): Promise<{ results: { target_id: string; status: RatingReminderStatus }[]; error?: string }> {
  if (!supabase) return { results: [], error: UNAVAILABLE.error };
  const { data, error } = await supabase.rpc('remind_rating', { p_movie_id: movieId, p_targets: targets, p_channel: channel });
  if (error) return { results: [], error: error.message };
  return { results: (data ?? []) as { target_id: string; status: RatingReminderStatus }[] };
}

/**
 * Temps réel des compléments. Ces tables n'ont pas de `space_id` : comme pour
 * les notes, l'appelant regroupe les rafales et relit.
 */
export function subscribeToVerdicts(spaceId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase.channel(`verdicts-${spaceId}`);
  for (const table of ['space_movie_skips', 'verdict_messages', 'review_reactions', 'space_verdicts']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => {
    supabase?.removeChannel(channel);
  };
}
