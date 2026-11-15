import { CinemaScreening, CinemaScreeningInput, CinemaScreeningStatus } from '../types';
import { supabase } from './supabase';
import { cacheTicketCodes } from '../utils/ticketCode';

/** Émis après chaque écriture réussie : toutes les vues de « mes places » se rechargent. */
export const SCREENINGS_CHANGED = 'bitter:screenings-changed';
export const notifyScreeningsChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SCREENINGS_CHANGED));
};
const changed = <T,>(value: T): T => {
  if (value === true || (typeof value === 'object' && value && (value as { ok?: boolean }).ok)) notifyScreeningsChanged();
  return value;
};

interface ScreeningRow {
  id: string;
  profile_id: string;
  tmdb_id: number | null;
  title: string;
  poster_url: string | null;
  starts_at: string;
  cinema_name: string | null;
  cinema_address: string | null;
  format: string | null;
  notes: string | null;
  status: CinemaScreeningStatus;
  rating_confirmed_at?: string | null;
  reminder_offsets_minutes: unknown;
  plan_id?: string | null;
  booking_url?: string | null;
  ticket_code?: string | null;
  created_at: string;
  updated_at: string;
}

export type ScreeningWrite = { ok: true; screening: CinemaScreening } | { ok: false; error: string };
export type ScreeningDelete = { ok: true } | { ok: false; error: string };

const MAX_REMINDERS = 4;
const DEFAULT_REMINDERS = [2_880, 30];
const WRITE_TIMEOUT_MS = 15_000;

const timestamp = (value: string): number => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const cleanText = (value: string | undefined, max: number): string | null => {
  const cleaned = value?.trim().slice(0, max);
  return cleaned || null;
};

const normaliseOffsets = (offsets: number[] | undefined): number[] => {
  const source = offsets?.length ? offsets : DEFAULT_REMINDERS;
  return [...new Set(source.map((offset) => Math.round(Number(offset))))]
    .filter((offset) => Number.isFinite(offset) && offset >= 1 && offset <= 10_080)
    .sort((a, b) => b - a)
    .slice(0, MAX_REMINDERS);
};

const fromRow = (row: ScreeningRow): CinemaScreening => ({
  id: row.id,
  profileId: row.profile_id,
  tmdbId: row.tmdb_id ?? undefined,
  title: row.title,
  posterUrl: row.poster_url ?? undefined,
  startsAt: timestamp(row.starts_at),
  cinemaName: row.cinema_name ?? undefined,
  cinemaAddress: row.cinema_address ?? undefined,
  format: row.format ?? undefined,
  notes: row.notes ?? undefined,
  status: row.status,
  ratingConfirmedAt: row.rating_confirmed_at ? Date.parse(row.rating_confirmed_at) : undefined,
  reminderOffsetsMinutes: Array.isArray(row.reminder_offsets_minutes)
    ? row.reminder_offsets_minutes.map(Number).filter(Number.isFinite)
    : DEFAULT_REMINDERS,
  planId: row.plan_id ?? undefined,
  ticketCode: row.ticket_code ?? undefined,
  bookingUrl: row.booking_url ?? undefined,
  createdAt: timestamp(row.created_at),
  updatedAt: timestamp(row.updated_at),
});

const messageFor = (error: unknown) => {
  const known = error as { message?: string; code?: string; details?: string };
  const raw = known?.message || '';
  console.warn('[Séances] Écriture refusée', { code: known?.code, message: raw, details: known?.details });
  if (raw.toLowerCase().includes('row-level security')) return 'Cette séance ne t’appartient pas.';
  if (known?.code === '23503') return 'Ton compte doit être synchronisé avant de créer une séance. Ferme et rouvre The Bitter, puis réessaie.';
  if (known?.code === '23514') return 'Vérifie le titre, la date et les rappels de la séance.';
  return 'Impossible d’enregistrer la séance. Réessaie dans un instant.';
};

const messageForException = (error: unknown) => {
  const message = (error as Error)?.message || '';
  if (/abort|timeout|timed out/i.test(message)) {
    return 'La sauvegarde a mis trop de temps. Vérifie ta connexion puis réessaie.';
  }
  return message || 'Séance invalide.';
};

const toRow = (input: CinemaScreeningInput) => {
  const startsAt = new Date(input.startsAt);
  const title = cleanText(input.title, 240);
  const offsets = normaliseOffsets(input.reminderOffsetsMinutes);
  if (!title) throw new Error('Titre obligatoire');
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Horaire invalide');
  if (offsets.length === 0) throw new Error('Au moins un rappel est nécessaire');

  return {
    tmdb_id: input.tmdbId ?? null,
    title,
    poster_url: cleanText(input.posterUrl, 2_000),
    starts_at: startsAt.toISOString(),
    cinema_name: cleanText(input.cinemaName, 240),
    cinema_address: cleanText(input.cinemaAddress, 500),
    format: cleanText(input.format, 100),
    notes: cleanText(input.notes, 1_000),
    reminder_offsets_minutes: offsets,
    ...(input.bookingUrl ? { booking_url: cleanText(input.bookingUrl, 2_000) } : {}),
    ...(input.ticketCode ? { ticket_code: cleanText(input.ticketCode, 4_000) } : {}),
  };
};

export const listUpcomingScreenings = async (profileId: string): Promise<CinemaScreening[]> => {
  if (!supabase || !profileId) return [];
  // Même raison que `listScreeningsForMovie` : au retour d'un arrière-plan, la
  // requête ne rend pas une erreur, elle rejette. Sans ce filet, le calendrier
  // ne se remplissait plus jusqu'au redémarrage de l'application.
  try {
    const { data, error } = await supabase
      .from('cinema_screenings')
      .select('*')
      .eq('profile_id', profileId)
      .gte('starts_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true });
    if (error) {
      console.warn('[Séances] Chargement échoué', error);
      return [];
    }
    const list = (data as ScreeningRow[]).map(fromRow);
    cacheTicketCodes(list);
    return list;
  } catch (error) {
    console.warn('[Séances] Calendrier injoignable', error);
    return [];
  }
};

/** Séances confirmées récentes : relancer un verdict, jamais une réservation en attente. */
export const listRecentScreenings = async (profileId: string): Promise<CinemaScreening[]> => {
  if (!supabase || !profileId) return [];
  try {
    const { data, error } = await supabase.from('cinema_screenings').select('*')
      .eq('profile_id', profileId).in('status', ['scheduled', 'completed'])
      .gte('starts_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false })
      .limit(100).abortSignal(AbortSignal.timeout(8000));
    return error ? [] : (data as ScreeningRow[] || []).map(fromRow);
  } catch { return []; }
};

/**
 * Les séances passées (vues ou prévues), pour « Tes salles » dans les stats :
 * depuis `fromIso`, ou toutes. Bornées à 1000 : bien au-delà d'une vie de ciné.
 */
export const listPastScreenings = async (profileId: string, fromIso?: string): Promise<CinemaScreening[]> => {
  if (!supabase || !profileId) return [];
  try {
    let query = supabase.from('cinema_screenings').select('*')
      .eq('profile_id', profileId).in('status', ['scheduled', 'completed'])
      .lte('starts_at', new Date().toISOString());
    if (fromIso) query = query.gte('starts_at', fromIso);
    const { data, error } = await query.order('starts_at', { ascending: false }).limit(1000).abortSignal(AbortSignal.timeout(8000));
    return error ? [] : (data as ScreeningRow[] || []).map(fromRow);
  } catch { return []; }
};

export const confirmScreeningRating = async (profileId: string, screeningId: string): Promise<boolean> => {
  if (!supabase || !profileId) return false;
  try {
    const { data, error } = await supabase.from('cinema_screenings')
      .update({ rating_confirmed_at: new Date().toISOString() })
      .eq('profile_id', profileId).eq('id', screeningId)
      .in('status', ['scheduled', 'completed']).lte('starts_at', new Date().toISOString())
      .select('id').abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
    return changed(!error && !!data);
  } catch { return false; }
};

export const cancelPastScreening = async (profileId: string, screeningId: string): Promise<boolean> => {
  if (!supabase || !profileId) return false;
  try {
    const { data, error } = await supabase.from('cinema_screenings')
      .update({ status: 'cancelled' }).eq('profile_id', profileId).eq('id', screeningId)
      .eq('status', 'scheduled').lte('starts_at', new Date().toISOString())
      .select('id').abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    return changed(!error && !!data);
  } catch { return false; }
};

/**
 * Les séances à venir déjà enregistrées pour un film donné.
 *
 * La fiche film s'en sert pour marquer les horaires déjà pris : sans cela, deux
 * touchers sur le même créneau créeraient deux lignes, et le calendrier
 * annoncerait deux fois la même sortie.
 */
export const listScreeningsForMovie = async (
  profileId: string,
  tmdbId: number
): Promise<CinemaScreening[]> => {
  if (!supabase || !profileId || !Number.isFinite(tmdbId)) return [];
  // Le try/catch n'est pas décoratif : quand le client Supabase revient d'une
  // mise en arrière-plan, `auth.getSession()` peut REJETER au bout de cinq
  // secondes au lieu de rendre une erreur. Sans lui, la promesse remontait
  // jusqu'à l'appelant et la fiche film restait sur son écran de chargement.
  try {
    const { data, error } = await supabase
      .from('cinema_screenings')
      .select('*')
      .eq('profile_id', profileId)
      .eq('tmdb_id', tmdbId)
      .gte('starts_at', new Date().toISOString())
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true });
    if (error) {
      console.warn('[Séances] Séances du film introuvables', error);
      return [];
    }
    const list = (data as ScreeningRow[]).map(fromRow);
    cacheTicketCodes(list);
    return list;
  } catch (error) {
    console.warn('[Séances] Séances du film injoignables', error);
    return [];
  }
};

export const createScreening = async (
  profileId: string,
  input: CinemaScreeningInput
): Promise<ScreeningWrite> => {
  if (!supabase) return { ok: false, error: 'Connecte-toi pour planifier une séance.' };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    // `status` est posé ici et pas dans `toRow` : une modification de séance ne
    // doit jamais requalifier en « réservée » ce qui attendait confirmation.
    const { data, error } = await supabase
      .from('cinema_screenings')
      .insert({ profile_id: profileId, ...toRow(input), status: input.status ?? 'scheduled' })
      .select('*')
      .abortSignal(controller.signal)
      .single();
    if (error || !data) return { ok: false, error: messageFor(error) };
    return changed({ ok: true, screening: fromRow(data as ScreeningRow) });
  } catch (error) {
    return { ok: false, error: messageForException(error) };
  } finally {
    window.clearTimeout(timeout);
  }
};

export const updateScreening = async (
  screeningId: string,
  input: CinemaScreeningInput
): Promise<ScreeningWrite> => {
  if (!supabase) return { ok: false, error: 'Connecte-toi pour modifier une séance.' };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('cinema_screenings')
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq('id', screeningId)
      .select('*')
      .abortSignal(controller.signal)
      .single();
    if (error || !data) return { ok: false, error: messageFor(error) };
    return changed({ ok: true, screening: fromRow(data as ScreeningRow) });
  } catch (error) {
    return { ok: false, error: messageForException(error) };
  } finally {
    window.clearTimeout(timeout);
  }
};

export const updateScreeningStatus = async (
  screeningId: string,
  status: CinemaScreeningStatus
): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase
    .from('cinema_screenings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', screeningId);
  if (error) {
    console.warn('[Séances] Mise à jour du statut échouée', error);
    return false;
  }
  return changed(true);
};

/**
 * « J'ai réservé » : la séance passe de `pending` à `scheduled`.
 *
 * C'est ce passage, et lui seul, qui programme les rappels — le trigger
 * `sync_screening_reminders` s'exécute AFTER UPDATE OF status et n'insère de
 * notifications que pour une séance `scheduled`. Tant que personne n'a confirmé,
 * personne n'est prévenu d'une réservation qui n'existe peut-être pas.
 *
 * La condition `status = 'pending'` évite qu'un double toucher ne rejoue le
 * trigger sur une séance déjà confirmée.
 */
export const confirmScreening = async (screeningId: string): Promise<ScreeningWrite> => {
  if (!supabase) return { ok: false, error: 'Connecte-toi pour confirmer une séance.' };
  if (!screeningId) return { ok: false, error: 'Séance invalide.' };

  const { data, error } = await supabase
    .from('cinema_screenings')
    .update({ status: 'scheduled', updated_at: new Date().toISOString() })
    .eq('id', screeningId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.warn('[Séances] Confirmation refusée', error);
    return { ok: false, error: 'Impossible de confirmer cette séance. Réessaie dans un instant.' };
  }
  return changed({ ok: true, screening: fromRow(data as ScreeningRow) });
};

/**
 * Supprimer une séance supprime aussi ses rappels non envoyés : la clé étrangère
 * de notification_deliveries est définie avec `on delete cascade` en base.
 * La policy RLS limite la suppression au propriétaire de la séance.
 */
export const deleteScreening = async (screeningId: string): Promise<ScreeningDelete> => {
  if (!supabase) return { ok: false, error: 'Connecte-toi pour retirer une séance.' };
  if (!screeningId) return { ok: false, error: 'Séance invalide.' };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('cinema_screenings')
      .delete()
      .eq('id', screeningId)
      .select('id')
      .abortSignal(controller.signal)
      .maybeSingle();
    if (error || !data) {
      console.warn('[Séances] Suppression refusée', error);
      return { ok: false, error: 'Impossible de retirer cette séance. Réessaie dans un instant.' };
    }
    return changed({ ok: true });
  } catch (error) {
    return { ok: false, error: messageForException(error) };
  } finally {
    window.clearTimeout(timeout);
  }
};

/**
 * Rattache une séance de mon calendrier à une invitation de l'espace.
 *
 * Quand l'invitation est acceptée, le serveur inscrit la séance au calendrier
 * de chacun (`private.add_plan_screening`, unique par invitation et personne).
 * Rattachée d'abord, ma séance existante tient lieu de la mienne : pas de
 * doublon dans le calendrier.
 */
export const linkScreeningToPlan = async (screeningId: string, planId: string): Promise<boolean> => {
  if (!supabase || !screeningId || !planId) return false;
  try {
    const { error } = await supabase.from('cinema_screenings').update({ plan_id: planId }).eq('id', screeningId);
    if (error) console.warn('[Séances] Rattachement à l’invitation impossible', error);
    return changed(!error);
  } catch (error) {
    console.warn('[Séances] Rattachement à l’invitation injoignable', error);
    return false;
  }
};

/** Les séances des autres membres qui sont aussi les miennes (même film, ±15 min, même cinéma). */
export const listSpaceScreeningMatches = async (
  spaceId: string
): Promise<{ tmdbId: number; profileId: string; startsAt: number }[]> => {
  if (!supabase || !spaceId) return [];
  try {
    const { data, error } = await supabase.rpc('space_screening_matches', { p_space_id: spaceId });
    if (error || !Array.isArray(data)) return [];
    return (data as { tmdb_id: number; profile_id: string; starts_at: string }[]).map((row) => ({
      tmdbId: row.tmdb_id,
      profileId: row.profile_id,
      startsAt: new Date(row.starts_at).getTime(),
    }));
  } catch {
    return [];
  }
};

/** Le QR code d'un billet, ajouté à une séance déjà au calendrier. */
export const setScreeningTicketCode = async (screeningId: string, ticketCode: string): Promise<boolean> => {
  if (!supabase || !screeningId || !ticketCode) return false;
  try {
    const { error } = await supabase
      .from('cinema_screenings')
      .update({ ticket_code: ticketCode.slice(0, 4_000), updated_at: new Date().toISOString() })
      .eq('id', screeningId);
    if (error) console.warn('[Séances] QR code du billet non enregistré', error);
    return changed(!error);
  } catch (error) {
    console.warn('[Séances] QR code du billet injoignable', error);
    return false;
  }
};
