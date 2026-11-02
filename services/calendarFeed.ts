import { supabase } from './supabase';

/**
 * L'agenda iCal d'un compte (voir api/agenda.ts) : son code secret, et les deux
 * adresses qui en découlent. `webcal://` ouvre l'abonnement dans le Calendrier
 * de l'iPhone ; `https://` se colle dans Google Agenda ou s'envoie à un proche.
 */
const SITE_HOST = 'thebitter.watch';

export const agendaLinks = (token: string) => ({
  https: `https://${SITE_HOST}/agenda/${token}.ics`,
  webcal: `webcal://${SITE_HOST}/agenda/${token}.ics`,
});

/** Le code du compte connecté ; `rotate` en crée un nouveau et coupe l'ancien lien. */
export async function getAgendaToken(rotate = false): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('calendar_feed_token', { p_rotate: rotate });
  if (error || typeof data !== 'string') return null;
  return data;
}
