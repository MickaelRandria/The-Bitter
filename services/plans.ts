/**
 * La séance à deux : propositions (`watch_plans`) et leurs créneaux.
 *
 * Lecture directe (les membres de l'espace voient ses propositions), écriture
 * uniquement par les fonctions serveur de `20260926_seance_a_deux` : c'est le
 * serveur qui cale la séance, l'inscrit au calendrier de chacun et prévient.
 */
import { supabase } from './supabase';
import type { PlanSlot } from '../supabase/functions/notify/messages.ts';

export type { PlanSlot };

export type PlanStatus = 'open' | 'agreed' | 'replaced' | 'cancelled';

export interface WatchPlan {
  id: string;
  proposer_id: string;
  space_id: string | null;
  shared_movie_id: string | null;
  status: PlanStatus;
  chosen_slot_id: string | null;
  participant_ids: string[];
  created_at: string;
  slots: (PlanSlot & { id: string; position: number })[];
}

/** Un créneau à proposer, avant son passage par le serveur. */
export interface SlotDraft {
  starts_at: string;
  cinema_name?: string;
  cinema_id?: string;
  showtime_id?: string;
  version?: string;
  booking_url?: string;
}

const MESSAGES: Record<string, string> = {
  'not-authenticated': 'Connecte-toi pour proposer une séance.',
  'not-a-member': 'Tu ne fais plus partie de cet espace.',
  'invalid-slots': 'Choisis au moins un créneau à venir.',
  'plan-already-agreed': 'Une séance est déjà calée pour ce film. Annule-la d’abord.',
  'plan-closed': 'Un autre créneau a déjà été choisi.',
  'slot-past': 'Ce créneau est passé.',
  'own-plan': 'C’est ta proposition : attends la réponse.',
  'rate-limited': 'Tu as beaucoup proposé aujourd’hui. Réessaie demain.',
  'not-a-participant': 'Tu ne fais pas partie de cette séance.',
};

export const planError = (error: unknown): string => {
  const raw = (error as { message?: string })?.message ?? '';
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/failed to fetch|load failed|network/i.test(raw)) return 'Connexion perdue. Réessaie.';
  console.warn('[Séance]', raw, error);
  return 'Ça n’a pas marché. Réessaie dans un instant.';
};

/** Propositions en cours ou calées de l'espace, les plus récentes d'abord. */
export async function getSpacePlans(spaceId: string): Promise<WatchPlan[]> {
  if (!supabase || !spaceId) return [];
  const { data, error } = await supabase
    .from('watch_plans')
    .select('id, proposer_id, space_id, shared_movie_id, status, chosen_slot_id, participant_ids, created_at, slots:watch_plan_slots!watch_plan_slots_plan_id_fkey(id, position, starts_at, cinema_name, version, booking_url)')
    .eq('space_id', spaceId)
    .in('status', ['open', 'agreed'])
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[Séance] Lecture impossible', error);
    return [];
  }
  return ((data || []) as WatchPlan[]).map((plan) => ({
    ...plan,
    participant_ids: plan.participant_ids || [],
    slots: [...(plan.slots || [])].sort((a, b) => a.position - b.position),
  }));
}

/**
 * La proposition qui compte pour un film : celle calée et encore à venir (ou
 * d'hier, pour demander la note), sinon celle ouverte.
 */
export const currentPlanFor = (plans: WatchPlan[], sharedMovieId: string): WatchPlan | null => {
  const mine = plans.filter((p) => p.shared_movie_id === sharedMovieId);
  return mine.find((p) => p.status === 'agreed') ?? mine.find((p) => p.status === 'open') ?? null;
};

export const chosenSlotOf = (plan: WatchPlan | null) =>
  plan?.slots.find((s) => s.id === plan.chosen_slot_id) ?? null;

export async function proposePlan(sharedMovieId: string, slots: SlotDraft[]): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };
  const { error } = await supabase.rpc('propose_plan', { p_shared_movie_id: sharedMovieId, p_slots: slots });
  return error ? { ok: false, error: planError(error) } : { ok: true };
}

export async function acceptSlot(slotId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };
  const { error } = await supabase.rpc('accept_plan_slot', { p_slot_id: slotId });
  return error ? { ok: false, error: planError(error) } : { ok: true };
}

export async function cancelPlan(planId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Sauvegarde en ligne indisponible' };
  const { error } = await supabase.rpc('cancel_plan', { p_plan_id: planId });
  return error ? { ok: false, error: planError(error) } : { ok: true };
}

/** Temps réel : une proposition créée, calée ou annulée dans l'espace. */
export function subscribeToPlans(spaceId: string, onChange: () => void): () => void {
  if (!supabase || !spaceId) return () => {};
  const client = supabase;
  const channel = client
    .channel(`plans-${spaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_plans', filter: `space_id=eq.${spaceId}` }, () =>
      onChange()
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
