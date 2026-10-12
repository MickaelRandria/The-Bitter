/**
 * Le Fil du jour, côté données : ce que chacun a répondu, et les résultats.
 *
 * Tout est d'abord gardé sur l'appareil, puis envoyé sur le compte
 * (table daily_fil_answers, migration 20261013). Tant que la migration n'est
 * pas appliquée, les envois échouent sans bruit : la série et les réponses
 * restent sur l'appareil, et les résultats de la communauté ne s'affichent pas.
 */
import { supabase } from './supabase';

export interface DayAnswer {
  tries?: number;
  found?: boolean;
  q1?: 'a' | 'b';
  q2?: 'a' | 'b';
  done?: boolean;
}

export interface DayResults {
  q1: { a: number; b: number };
  q2: { a: number; b: number };
  players: number;
  found: number;
  friends: { name: string; avatar: string | null; q1: string | null; q2: string | null; tries: number | null; found: boolean | null; done: boolean }[];
}

const KEY = 'bitter_fil_v1';

const readLocal = (): Record<string, DayAnswer> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const writeLocal = (all: Record<string, DayAnswer>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Stockage plein : la série repartira du compte.
  }
};

export const localAnswer = (day: string): DayAnswer => readLocal()[day] ?? {};
export const isDoneLocally = (day: string): boolean => !!readLocal()[day]?.done;

/** Prévient l'en-tête quand le Fil du jour vient d'être terminé. */
const listeners = new Set<() => void>();
export const onFilChange = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const uid = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
};

/** Enregistre une partie des réponses du jour. */
export async function saveAnswer(day: string, patch: DayAnswer): Promise<void> {
  const all = readLocal();
  all[day] = { ...all[day], ...patch };
  writeLocal(all);
  if (patch.done) listeners.forEach((fn) => fn());
  const id = await uid();
  if (!id || !supabase) return;
  const row: Record<string, unknown> = { day, profile_id: id, updated_at: new Date().toISOString() };
  if (patch.tries != null) row.mystery_tries = patch.tries;
  if (patch.found != null) row.mystery_found = patch.found;
  if (patch.q1) row.q1 = patch.q1;
  if (patch.q2) row.q2 = patch.q2;
  if (patch.done) row.done_at = new Date().toISOString();
  const { error } = await supabase.from('daily_fil_answers').upsert(row, { onConflict: 'day,profile_id' });
  if (error) console.warn('[Fil du jour] réponse gardée sur l’appareil :', error.message);
}

/** Les jours terminés : ceux du compte, plus ceux de l'appareil. */
export async function doneDays(): Promise<Set<string>> {
  const days = new Set(Object.entries(readLocal()).filter(([, a]) => a.done).map(([d]) => d));
  const id = await uid();
  if (id && supabase) {
    const { data, error } = await supabase
      .from('daily_fil_answers')
      .select('day')
      .eq('profile_id', id)
      .not('done_at', 'is', null)
      .order('day', { ascending: false })
      .limit(400);
    if (!error) for (const row of (data ?? []) as { day: string }[]) days.add(row.day);
  }
  return days;
}

/** Les résultats d'un jour ; null sans compte ou sans la migration. */
export async function dayResults(day: string): Promise<DayResults | null> {
  if (!supabase || !(await uid())) return null;
  const { data, error } = await supabase.rpc('daily_fil_results', { p_day: day });
  if (error || !data) return null;
  return data as DayResults;
}
