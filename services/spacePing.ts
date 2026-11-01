import { supabase } from './supabase';

/**
 * Prévenir des membres de son espace : le récap du mois est dispo, ou un défi
 * au blind test. Côté serveur, `ping_space_members` vérifie l'appartenance à
 * l'espace, les blocages et un plafond horaire (migration 20261101_ping_espace).
 */

export type PingKind = 'recap' | 'blind';

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
 */
export async function shareOutside(text: string): Promise<'shared' | 'copied' | null> {
  const url = 'https://thebitter.watch';
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
