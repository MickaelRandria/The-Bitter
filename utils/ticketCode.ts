/**
 * Le QR code d'un billet, gardé tel qu'il a été lu.
 *
 * On conserve ses octets exacts (« b:<base64> ») plutôt qu'un texte : un QR
 * peut coder des octets qui ne sont pas de l'UTF-8, et la borne relit les
 * octets, pas leur interprétation. Le redessiner à partir de ces mêmes octets
 * donne un code que la borne lit comme l'original.
 */

const PREFIX = 'b:';
const CACHE_KEY = 'bitter:ticket-codes';
/** Un billet reste disponible hors ligne jusqu'au lendemain de sa séance. */
const KEEP_AFTER_MS = 24 * 3_600_000;

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export function encodeTicketCode(bytes: Uint8Array | number[]): string | null {
  const list = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (list.length === 0 || list.length > 2_900) return null;
  return PREFIX + toBase64(list);
}

export function decodeTicketCode(code: string | null | undefined): Uint8Array | null {
  if (!code || !code.startsWith(PREFIX)) return null;
  try {
    const binary = atob(code.slice(PREFIX.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

type CachedCodes = Record<string, { code: string; startsAt: number }>;

const readCache = (): CachedCodes => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedCodes) : {};
  } catch {
    return {};
  }
};

/**
 * Garde sur l'appareil les billets des séances à venir : dans le hall d'un
 * cinéma, le réseau manque souvent au moment de passer la borne.
 */
export function cacheTicketCodes(screenings: { id: string; startsAt: number; ticketCode?: string }[], now = Date.now()) {
  try {
    const cache = readCache();
    for (const screening of screenings) {
      if (screening.ticketCode) cache[screening.id] = { code: screening.ticketCode, startsAt: screening.startsAt };
    }
    for (const [id, entry] of Object.entries(cache)) {
      if (entry.startsAt + KEEP_AFTER_MS < now) delete cache[id];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* stockage indisponible : le billet reste lisible en ligne */
  }
}

export function cachedTicketCode(screeningId: string): string | null {
  return readCache()[screeningId]?.code ?? null;
}

/** Le billet s'affiche à partir de la veille et jusqu'à trois heures après le début. */
export function isTicketDay(startsAt: number, now = Date.now()): boolean {
  return now >= startsAt - 24 * 3_600_000 && now <= startsAt + 3 * 3_600_000;
}
