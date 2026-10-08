/**
 * Relancer un vote dans un espace.
 *
 * Le serveur décide (`remind_vote`, migration 20261009_relances_de_vote) : il
 * refuse une relance moins de 5 jours après la précédente pour le même film et
 * la même personne, quel que soit l'expéditeur. L'app se contente d'afficher la
 * réponse.
 *
 * Deux canaux : la notification, pour qui l'a activée ; un message prêt à
 * envoyer (WhatsApp, SMS, copier) pour les autres — le cas le plus courant
 * aujourd'hui. Les deux passent par `remind_vote`, pour que la limite vaille
 * aussi pour les messages et que le groupe voie « relancés ».
 */
import { supabase } from './supabase';

export type ReminderChannel = 'push' | 'message';
export type ReminderStatus = 'sent' | 'too_soon' | 'already_voted' | 'not_member';

/** Délai minimal entre deux relances d'une même personne sur un même film. */
export const REMINDER_COOLDOWN_DAYS = 5;

export async function remindVote(
  sharedMovieId: string,
  targets: string[],
  channel: ReminderChannel
): Promise<{ results: { target_id: string; status: ReminderStatus }[]; error?: string }> {
  if (!supabase) return { results: [], error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('remind_vote', {
    p_movie_id: sharedMovieId,
    p_targets: targets,
    p_channel: channel,
  });
  if (error) return { results: [], error: error.message };
  return { results: (data ?? []) as { target_id: string; status: ReminderStatus }[] };
}

/** Les co-membres qui reçoivent les notifications. Vide en cas d'échec : on proposera le message. */
export async function membersWithPush(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.rpc('members_with_push');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: unknown) => (typeof row === 'string' ? row : (row as { members_with_push: string }).members_with_push)));
}

/** Dernière relance par film et par personne : `${movieId}:${targetId}` → date. */
export async function lastReminders(movieIds: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (!supabase || movieIds.length === 0) return map;
  const { data, error } = await supabase
    .from('vote_reminders')
    .select('shared_movie_id, target_id, created_at')
    .in('shared_movie_id', movieIds)
    .order('created_at', { ascending: false });
  if (error || !data) return map;
  for (const row of data as { shared_movie_id: string; target_id: string; created_at: string }[]) {
    const key = `${row.shared_movie_id}:${row.target_id}`;
    if (!map.has(key)) map.set(key, new Date(row.created_at));
  }
  return map;
}

/** Le lien qui ouvre directement la carte de vote. */
export const voteLink = (sharedMovieId: string) => `https://thebitter.watch/?vote=${sharedMovieId}`;
