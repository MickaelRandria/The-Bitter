import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Signaler un contenu, bloquer une personne.
 *
 * Exigé par Google Play pour toute app où des utilisateurs lisent ce que d'autres
 * publient. Le serveur fait foi : le fil d'activité ignore déjà les blocages dans
 * les deux sens (private.friends_activity_by_media). Côté app, la liste des
 * personnes bloquées sert à masquer ce qui arrive par d'autres chemins — avis
 * dans un espace partagé, profil d'un membre.
 */

export type ReportContentType = 'review' | 'feed_item' | 'profile' | 'space_movie';
export type ReportReason = 'offensive' | 'harassment' | 'spam' | 'inappropriate' | 'other';

export const REPORT_REASONS: ReportReason[] = ['offensive', 'harassment', 'spam', 'inappropriate', 'other'];

export interface ReportTarget {
  contentType: ReportContentType;
  contentId: string;
  reportedUserId: string;
  /** Prénom affiché dans la feuille de signalement. */
  reportedName: string;
  /** Le texte signalé, recopié pour que la modération puisse juger même s'il change. */
  snapshot?: string | null;
}

export interface ModerationResult {
  ok: boolean;
  error?: string;
}

const UNAVAILABLE = 'Connecte-toi pour signaler ou bloquer.';

export const reportContent = async (
  target: ReportTarget,
  reason: ReportReason,
  details?: string
): Promise<ModerationResult> => {
  if (!supabase) return { ok: false, error: UNAVAILABLE };
  const { error } = await supabase.from('content_reports').insert({
    reported_user_id: target.reportedUserId,
    content_type: target.contentType,
    content_id: target.contentId.slice(0, 100),
    reason,
    details: details?.trim().slice(0, 1000) || null,
    content_snapshot: target.snapshot?.slice(0, 4000) || null,
  });
  // Déjà signalé par cette personne : pour elle, le résultat est le même.
  if (error && error.code !== '23505') {
    if (import.meta.env.DEV) console.error('[Modération] Signalement :', error);
    return { ok: false, error: error.code === '42501' ? UNAVAILABLE : "Le signalement n'a pas pu être envoyé." };
  }
  return { ok: true };
};

/* ---------- Blocages : un état partagé par tous les écrans ---------- */

let blocked = new Set<string>();
let loadedFor: string | null = null;
const listeners = new Set<(ids: Set<string>) => void>();

const publish = (next: Set<string>) => {
  blocked = next;
  listeners.forEach((listener) => listener(blocked));
};

export const loadBlockedUsers = async (): Promise<Set<string>> => {
  if (!supabase) return blocked;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id ?? null;
  if (!userId) {
    loadedFor = null;
    publish(new Set());
    return blocked;
  }
  if (loadedFor === userId) return blocked;
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) {
    if (import.meta.env.DEV) console.error('[Modération] Lecture des blocages :', error);
    return blocked;
  }
  loadedFor = userId;
  publish(new Set((data ?? []).map((row: { blocked_id: string }) => row.blocked_id)));
  return blocked;
};

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
    loadedFor = null;
    void loadBlockedUsers();
  }
});

export const blockUser = async (userId: string): Promise<ModerationResult> => {
  if (!supabase) return { ok: false, error: UNAVAILABLE };
  const { error } = await supabase.from('user_blocks').insert({ blocked_id: userId });
  if (error && error.code !== '23505') {
    if (import.meta.env.DEV) console.error('[Modération] Blocage :', error);
    return { ok: false, error: error.code === '42501' ? UNAVAILABLE : "Le blocage n'a pas pu être enregistré." };
  }
  publish(new Set([...blocked, userId]));
  return { ok: true };
};

export const unblockUser = async (userId: string): Promise<ModerationResult> => {
  if (!supabase) return { ok: false, error: UNAVAILABLE };
  const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', userId);
  if (error) {
    if (import.meta.env.DEV) console.error('[Modération] Déblocage :', error);
    return { ok: false, error: "Le déblocage n'a pas pu être enregistré." };
  }
  const next = new Set(blocked);
  next.delete(userId);
  publish(next);
  return { ok: true };
};

/** Les personnes que j'ai bloquées, tenues à jour dans tous les écrans ouverts. */
export const useBlockedUsers = (): Set<string> => {
  const [ids, setIds] = useState(blocked);
  useEffect(() => {
    listeners.add(setIds);
    void loadBlockedUsers();
    return () => {
      listeners.delete(setIds);
    };
  }, []);
  return ids;
};

export interface BlockedPerson {
  id: string;
  firstName: string;
  blockedAt: string;
}

/** Pour la liste « Personnes bloquées » du profil. */
export const listBlockedPeople = async (): Promise<BlockedPerson[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const ids = data.map((row: { blocked_id: string }) => row.blocked_id);
  // Le prénom peut être illisible (plus d'espace commun) : on garde la ligne,
  // pour qu'un blocage reste toujours annulable.
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, first_name').in('id', ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p: { id: string; first_name: string | null }) => [p.id, p.first_name]));
  return data.map((row: { blocked_id: string; created_at: string }) => ({
    id: row.blocked_id,
    firstName: names.get(row.blocked_id) || 'Membre',
    blockedAt: row.created_at,
  }));
};
