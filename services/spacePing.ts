import { supabase } from './supabase';

/**
 * Prévenir des membres de son espace : le récap du mois est dispo, ou un défi
 * au blind test ou à « Qui a mis cette note ? ». Côté serveur, `ping_space_members` vérifie l'appartenance à
 * l'espace, les blocages et un plafond horaire (migration 20261101_ping_espace).
 */

export type PingKind = 'recap' | 'blind' | 'who';

const ERRORS: Record<string, string> = {
  'rate-limited': 'Beaucoup de messages envoyés cette heure-ci. Réessaie un peu plus tard.',
  'invitee-not-allowed': 'Une des personnes choisies ne peut pas être prévenue.',
  'too-many-invitees': 'Huit personnes au plus à la fois.',
};

export async function pingSpaceMembers(
  spaceId: string,
  what: PingKind,
  recipients: string[],
  extra: { score?: number; total?: number; month?: string } = {}
): Promise<{ sent: number; error?: string }> {
  if (!supabase) return { sent: 0, error: 'Sauvegarde en ligne indisponible' };
  const { data, error } = await supabase.rpc('ping_space_members', {
    p_space: spaceId,
    p_what: what,
    p_recipients: recipients,
    p_score: extra.score ?? null,
    p_total: extra.total ?? null,
    p_month: extra.month ?? null,
  });
  if (error) {
    const known = Object.keys(ERRORS).find((key) => error.message?.includes(key));
    return { sent: 0, error: known ? ERRORS[known] : 'Le message n’a pas pu partir. Réessaie dans un instant.' };
  }
  return { sent: Number(data) || 0 };
}

/**
 * Partage hors de l'app (Instagram, Messages, WhatsApp…) par la feuille de
 * partage du téléphone ; à défaut, le texte est copié. Rend 'shared',
 * 'copied' ou null (annulé, ou rien de possible).
 *
 * Le lien mène à l'espace (`?space=`). Sur Android, l'app installée l'ouvre
 * elle-même ; sur iPhone, un lien s'ouvre toujours dans Safari : la page y
 * invite à ouvrir l'app (OpenInAppSheet).
 */
export async function shareOutside(text: string, spaceId?: string, what?: PingKind): Promise<'shared' | 'copied' | null> {
  const link = new URL('https://thebitter.watch/');
  if (spaceId) link.searchParams.set('space', spaceId);
  if (spaceId && what) link.searchParams.set('story', what);
  const url = link.href;
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return null;
  }
}

export interface SpaceChallenge {
  actorId: string;
  what: 'blind' | 'who';
  score?: number;
  total?: number;
  createdAt: string;
}

/** Le dernier défi reçu dans cet espace (blind test ou « Qui a mis cette note ? »), s'il y en a un. */
export async function getLastSpaceChallenge(spaceId: string, userId: string): Promise<SpaceChallenge | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('notifications')
    .select('actor_id, payload, created_at')
    .eq('recipient_id', userId)
    .eq('space_id', spaceId)
    .eq('kind', 'space_ping')
    .in('payload->>what', ['blind', 'who'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.actor_id) return null;
  const payload = (data.payload ?? {}) as { what?: string; score?: number; total?: number };
  return {
    actorId: data.actor_id,
    what: payload.what === 'who' ? 'who' : 'blind',
    score: payload.score,
    total: payload.total,
    createdAt: data.created_at,
  };
}
