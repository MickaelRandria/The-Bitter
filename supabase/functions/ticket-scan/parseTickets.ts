/**
 * Lecture de la réponse du modèle.
 *
 * Module pur : la fonction Edge l'importe, et les tests de `tests/` chargent ce
 * même fichier. Ce qui en sort finit dans un calendrier et programme des
 * rappels : chaque champ est donc borné, chaque date et chaque heure vérifiées,
 * et un billet incomplet est écarté plutôt que complété par supposition.
 */

export interface ScannedTicket {
  title: string;
  /** Tel qu'écrit sur la capture ; vide s'il n'y figure pas. */
  cinema: string;
  /** aaaa-mm-jj */
  date: string;
  /** hh:mm, heure de début */
  time: string;
  version: string;
  room: string;
  seats: number;
}

const MAX_TICKETS = 12;
/**
 * Une capture de « Mes billets » montre des séances à venir, parfois celles de
 * la veille. Au-delà de ces bornes, la date a presque sûrement été mal lue —
 * une année devinée de travers, typiquement.
 */
const PAST_DAYS = 31;
const FUTURE_DAYS = 120;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** « 9:05 », « 9h05 », « 21H30 » → « 09:05 », « 21:30 » ; `null` si ce n'est pas une heure. */
export const normalizeTime = (value: string): string | null => {
  const match = value.trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** aaaa-mm-jj, et un vrai jour du calendrier : le 31 février n'en est pas un. */
const validDate = (value: string): string | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? value : null;
};

const dayNumber = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

const readJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    // Le mode JSON rend presque toujours un objet propre ; à défaut, on tente
    // le premier bloc entre accolades avant de renoncer.
    const block = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!block) return null;
    try {
      return JSON.parse(block);
    } catch {
      return null;
    }
  }
};

/**
 * Les billets lisibles, dédoublonnés, dans l'ordre de la capture.
 *
 * `todayIso` est le jour parisien de la lecture : il sert à écarter les dates
 * invraisemblables, jamais à en inventer une.
 */
export const parseTickets = (raw: string, todayIso: string): ScannedTicket[] => {
  const parsed = readJson(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed as { tickets?: unknown } | null)?.tickets;
  if (!Array.isArray(list)) return [];

  const today = dayNumber(todayIso);
  const seen = new Set<string>();
  const tickets: ScannedTicket[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const title = text(entry.title, 200);
    const date = validDate(text(entry.date, 10));
    const time = normalizeTime(text(entry.time, 8));
    if (!title || !date || !time) continue;

    const offset = dayNumber(date) - today;
    if (offset < -PAST_DAYS || offset > FUTURE_DAYS) continue;

    const key = `${title.toLocaleLowerCase('fr')}|${date}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // L'absence reste l'absence : `Number(null)` vaudrait 0, pas « une place ».
    const seats = entry.seats === null || entry.seats === undefined || entry.seats === '' ? NaN : Math.round(Number(entry.seats));
    tickets.push({
      title,
      cinema: text(entry.cinema, 120),
      date,
      time,
      version: text(entry.version, 20),
      room: text(entry.room, 40),
      seats: Number.isFinite(seats) && seats >= 1 && seats <= 20 ? seats : 1,
    });
    if (tickets.length >= MAX_TICKETS) break;
  }

  return tickets;
};
