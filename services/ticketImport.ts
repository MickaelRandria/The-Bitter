import { CinemaScreening, FavoriteCinema } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { supabase } from './supabase';

/**
 * Import de billets de cinéma depuis une capture d'écran.
 *
 * Réserver avec la carte UGC Illimité n'envoie aucun e-mail : le billet ne vit
 * que dans l'application UGC. Trois étapes, trois sources, et aucune ne croit
 * la précédente sur parole :
 *
 * 1. `ticket-scan` lit la capture — le modèle recopie, il ne décide rien ;
 * 2. `cinema-directory` cherche chaque billet dans la vraie grille UGC ;
 * 3. TMDB donne la fiche du film, pour l'affiche et la liste « À voir ».
 *
 * Rien n'est écrit tant que la personne n'a pas validé la liste.
 */

/** Ce que la capture dit d'une séance, avant toute vérification. */
export interface ScannedTicket {
  title: string;
  /** Tel qu'écrit sur la capture ; vide s'il n'y figure pas. */
  cinema: string;
  /** aaaa-mm-jj */
  date: string;
  /** hh:mm */
  time: string;
  version: string;
  room: string;
  seats: number;
}

export type TicketMatchStatus = 'matched' | 'time-mismatch' | 'not-found' | 'cinema-unknown' | 'unavailable';

/** Une séance telle qu'UGC la publie. */
export interface TicketShowing {
  id: string;
  title: string;
  startsAt: number;
  version?: string;
  room?: string;
  endTime?: string;
  bookingUrl: string;
  posterUrl?: string;
}

export interface TicketMatch {
  status: TicketMatchStatus;
  cinema: { id: string; name: string; city: string } | null;
  /** Renseignée seulement quand le film ET l'heure figurent dans la grille. */
  showing: TicketShowing | null;
  /** Les autres horaires du même film ce jour-là, du plus proche au plus lointain. */
  alternatives: TicketShowing[];
}

export interface TicketFilm {
  tmdbId: number;
  title: string;
  posterUrl?: string;
}

/**
 * L'app UGC montre une séance par écran : il faut une image par réservation.
 * Dix couvrent largement une semaine chargée ; le serveur en lit quatre par
 * appel, on découpe donc ici.
 */
export const MAX_TICKET_IMAGES = 10;
const SCAN_BATCH = 4;
const MAX_SIDE = 1_600;
const JPEG_QUALITY = 0.82;
/** Le serveur en accepte huit par appel ; au-delà, on découpe. */
const MATCH_BATCH = 8;

const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Cette image ne peut pas être lue.'));
    };
    image.src = url;
  });

/**
 * Réduit une capture avant l'envoi.
 *
 * Un écran de téléphone fait 2 500 px de haut et pèse plusieurs Mo en PNG. À
 * 1 600 px, le texte d'un billet reste parfaitement lisible pour un dixième du
 * poids — et c'est ce poids que le réseau mobile, puis le modèle, paient.
 */
export const prepareTicketImage = async (file: File): Promise<string> => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossible de préparer la capture.');
  // Une capture PNG peut être transparente ; en JPEG, la transparence devient
  // du noir, et un texte sombre y disparaîtrait.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

/**
 * `invoke` ne remonte que le statut d'une erreur. Lire le corps nous-mêmes
 * distingue « connecte-toi » de « quota atteint » de « le service est tombé ».
 */
const readFunctionError = async (error: unknown, fallback: string): Promise<string> => {
  const response = (error as { context?: Response })?.context;
  if (response && typeof response.json === 'function') {
    const detail = await response.json().catch(() => null);
    if (detail?.message) return String(detail.message);
  }
  return fallback;
};

const scanBatch = async (images: string[]): Promise<ScannedTicket[]> => {
  if (!supabase) throw new Error('Connecte-toi pour importer tes billets.');
  const { data, error } = await withTimeout(
    supabase.functions.invoke('ticket-scan', { body: { images } }),
    65_000,
    'La lecture prend trop de temps. Réessaie avec moins d’images.'
  );
  if (error) throw new Error(await readFunctionError(error, 'La lecture des billets est momentanément indisponible.'));
  return Array.isArray(data?.tickets) ? (data.tickets as ScannedTicket[]) : [];
};

/**
 * Les séances réservées lisibles sur les images, dans leur ordre d'apparition.
 *
 * Les lots partent ensemble : dix images ne doivent pas coûter trois attentes.
 * Un lot en échec n'emporte pas les autres ; seul l'échec de tous est une erreur.
 * `failedImages` dit combien d'images n'ont pas pu être lues, pour le signaler.
 */
export const scanTicketImages = async (
  images: string[]
): Promise<{ tickets: ScannedTicket[]; failedImages: number }> => {
  const batches: string[][] = [];
  for (let index = 0; index < images.length; index += SCAN_BATCH) batches.push(images.slice(index, index + SCAN_BATCH));
  const results = await Promise.allSettled(batches.map(scanBatch));
  const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (firstError && results.every((result) => result.status === 'rejected')) throw firstError.reason;

  const seen = new Set<string>();
  const tickets: ScannedTicket[] = [];
  let failedImages = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failedImages += batches[index].length;
      return;
    }
    for (const ticket of result.value) {
      // La même séance partagée puis capturée : une seule ligne.
      const key = `${normalise(ticket.title)}|${ticket.date}|${ticket.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tickets.push(ticket);
    }
  });
  return { tickets, failedImages };
};

interface RawShowing extends Omit<TicketShowing, 'startsAt'> {
  startsAt: string;
}

const toShowing = (raw: RawShowing | null | undefined): TicketShowing | null => {
  if (!raw) return null;
  const startsAt = new Date(raw.startsAt).getTime();
  return Number.isFinite(startsAt) ? { ...raw, startsAt, posterUrl: raw.posterUrl || undefined } : null;
};

/**
 * Chaque billet cherché dans la grille UGC, dans le même ordre.
 *
 * `null` quand la vérification elle-même est indisponible : l'import reste
 * possible, mais chaque billet s'affiche alors comme « non vérifié » plutôt
 * que d'être présenté comme confirmé.
 */
export const matchTickets = async (
  tickets: ScannedTicket[],
  fallbackCinema?: FavoriteCinema
): Promise<TicketMatch[] | null> => {
  if (tickets.length === 0) return [];
  if (!supabase) return null;

  const results: TicketMatch[] = [];
  for (let index = 0; index < tickets.length; index += MATCH_BATCH) {
    const batch = tickets.slice(index, index + MATCH_BATCH);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('cinema-directory', {
          body: {
            action: 'match',
            tickets: batch.map(({ title, cinema, date, time, version }) => ({ title, cinema, date, time, version })),
            fallbackCinema,
          },
        }),
        30_000,
        'match-timeout'
      );
      if (error || !Array.isArray(data?.items) || data.items.length !== batch.length) return null;
      results.push(
        ...(data.items as { status: TicketMatchStatus; cinema: TicketMatch['cinema']; showing: RawShowing | null; alternatives?: RawShowing[] }[]).map(
          (item) => ({
            status: item.status,
            cinema: item.cinema ?? null,
            showing: toShowing(item.showing),
            alternatives: (item.alternatives ?? []).map(toShowing).filter((showing): showing is TicketShowing => showing !== null),
          })
        )
      );
    } catch (caught) {
      console.warn('[Billets] Vérification dans le programme indisponible', caught);
      return null;
    }
  }
  return results;
};

/**
 * La fiche TMDB du film. UGC écrit ses titres en majuscules et y colle parfois
 * un sous-titre ; la recherche retente avec le titre lu sur la capture.
 */
export const findTicketFilm = async (titles: string[]): Promise<TicketFilm | null> => {
  for (const title of [...new Set(titles.map((value) => value.trim()).filter(Boolean))]) {
    try {
      const response = await fetch(
        `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(title)}&page=1`
      );
      if (!response.ok) continue;
      const first = (await response.json())?.results?.[0];
      if (first?.id) {
        return {
          tmdbId: first.id,
          title: first.title || title,
          posterUrl: first.poster_path ? `${TMDB_IMAGE_URL}${first.poster_path}` : undefined,
        };
      }
    } catch (caught) {
      console.warn('[Billets] Fiche TMDB introuvable', caught);
    }
  }
  return null;
};

/** Jour et heure lus sur le billet, à l'heure de l'appareil : celle de la personne qui a réservé. */
export const localInstant = (date: string, time: string): number => new Date(`${date}T${time}:00`).getTime();

/**
 * Une séance déjà au calendrier pour le même film à la même minute. Le film est
 * reconnu par sa fiche TMDB quand les deux en ont une, sinon par son titre.
 */
export const findExistingScreening = (
  existing: CinemaScreening[],
  startsAt: number,
  title: string,
  tmdbId?: number
): CinemaScreening | undefined =>
  existing.find(
    (screening) =>
      Math.abs(screening.startsAt - startsAt) < 60_000 &&
      (tmdbId && screening.tmdbId ? screening.tmdbId === tmdbId : normalise(screening.title) === normalise(title))
  );

/** « 2 places · Salle 7 » : ce que le billet sait et que le calendrier n'a pas de champ pour dire. */
export const ticketNotes = (ticket: ScannedTicket): string => {
  const room = /^\d+$/.test(ticket.room) ? `Salle ${ticket.room}` : ticket.room;
  return [ticket.seats > 1 ? `${ticket.seats} places` : '', room].filter(Boolean).join(' · ');
};
