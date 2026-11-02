/**
 * L'agenda iCal d'un compte : thebitter.watch/agenda/:code.ics
 *
 * Un lien d'abonnement (webcal://) que le Calendrier de l'iPhone, Google Agenda
 * ou Outlook relisent d'eux-mêmes : les séances ajoutées, déplacées ou annulées
 * dans The Bitter y suivent. Le code vient de `calendar_feed_token` ; les
 * séances, de `get_calendar_feed` (migration 20261102_agenda_ical), lisible sans
 * compte puisque ce sont les agendas qui appellent.
 */
export const config = { runtime: 'edge' };

// Mêmes valeurs publiques et même prudence que api/share.ts.
const FALLBACK_URL = 'https://tnvnmsevddvcklkitnpa.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudm5tc2V2ZGR2Y2tsa2l0bnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDgwMTMsImV4cCI6MjA4NTk4NDAxM30.cQi9F7ECVNOk8h8JYoCWATqV3XUwjL4qE_8FQeisHXk';
const clean = (value: string | undefined) => (value || '').replace(/\s+/g, '');
const SUPABASE_URL = clean(process.env.VITE_SUPABASE_URL).replace(/\/+$/, '') || FALLBACK_URL;
const SUPABASE_ANON_KEY = clean(process.env.VITE_SUPABASE_ANON_KEY) || FALLBACK_KEY;

/** Une séance dure rarement moins : on bloque 2 h 30 dans l'agenda. */
const SLOT_MINUTES = 150;

export interface FeedScreening {
  id: string;
  title: string;
  starts_at: string;
  cinema_name?: string | null;
  cinema_address?: string | null;
  format?: string | null;
  status: string;
  booking_url?: string | null;
  updated_at?: string | null;
}

export interface Feed {
  first_name?: string | null;
  screenings: FeedScreening[];
}

/** Texte iCal : antislash, virgule, point-virgule et retours à la ligne échappés. */
export const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** 20261102T193000Z */
export const icsDate = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lignes repliées à 75 octets, sans couper un caractère UTF-8 en deux. */
export const fold = (line: string): string => {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75; // la suite commence par une espace
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
};

export function buildCalendar(feed: Feed, now = new Date()): string {
  const name = feed.first_name?.trim();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Bitter//Agenda des séances//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name ? `Séances de ${name} · The Bitter` : 'Mes séances · The Bitter')}`,
    'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const s of feed.screenings) {
    const start = new Date(s.starts_at);
    if (!s.id || !s.title || Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
    const stamp = s.updated_at && !Number.isNaN(new Date(s.updated_at).getTime()) ? new Date(s.updated_at) : now;
    const location = [s.cinema_name, s.cinema_address].filter(Boolean).join(', ');
    const description = [
      s.format ? `Version : ${s.format}` : '',
      s.status === 'pending' ? 'Séance à confirmer.' : '',
      s.booking_url ? `Réserver : ${s.booking_url}` : '',
      'Depuis The Bitter',
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@thebitter.watch`,
      `DTSTAMP:${icsDate(stamp)}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeText(`🎬 ${s.title}`)}`,
      ...(location ? [`LOCATION:${escapeText(location)}`] : []),
      `DESCRIPTION:${escapeText(description)}`,
      ...(s.booking_url && /^https:\/\//.test(s.booking_url) ? [`URL:${s.booking_url}`] : []),
      `STATUS:${s.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const readFeed = async (base: string, key: string, token: string): Promise<Feed | null> => {
  try {
    const res = await fetch(`${base}/rest/v1/rpc/get_calendar_feed`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) {
      console.warn('[agenda] get_calendar_feed a répondu', base, res.status);
      return null;
    }
    const data = await res.json();
    return data && typeof data === 'object' && Array.isArray(data.screenings) ? (data as Feed) : null;
  } catch (error) {
    console.warn('[agenda] appel impossible', base, String(error));
    return null;
  }
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || '').replace(/\.ics$/i, '');
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return new Response('Agenda introuvable', { status: 404 });
  const feed =
    (await readFeed(SUPABASE_URL, SUPABASE_ANON_KEY, token)) ??
    (SUPABASE_URL !== FALLBACK_URL ? await readFeed(FALLBACK_URL, FALLBACK_KEY, token) : null);
  if (!feed) return new Response('Agenda introuvable', { status: 404 });
  return new Response(buildCalendar(feed), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="the-bitter.ics"',
      'Cache-Control': 'public, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  });
}
