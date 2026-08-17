import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UGC_DIRECTORY_URL = 'https://www.ugc.fr/cinemasQuickFilterAjaxAction%21getAllList.action';
const DIRECTORY_CACHE_MS = 12 * 60 * 60 * 1_000;

type UgcCinema = { id: string; name: string };
type UgcCity = { id: string; label: string; city: string; cinemas: UgcCinema[] };

let cachedDirectory: { expiresAt: number; cities: UgcCity[] } | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const cleanText = (value: unknown, maximum: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&agrave;/gi, 'à')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const stripHtml = (value: string) => cleanText(decodeHtml(value.replace(/<[^>]*>/g, ' ')), 200);

const fetchWithTimeout = async (url: string, timeoutMs = 12_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'The-Bitter UGC directory (https://thebitter.watch)',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parseUgcDirectory = (html: string): UgcCity[] => {
  const headings = [...html.matchAll(/<a\s+id="anchor_[^"]+"[\s\S]*?<span[^>]*class="text-uppercase"[^>]*>([\s\S]*?)<\/span>/gi)];
  const cities: UgcCity[] = [];

  headings.forEach((heading, index) => {
    const rawLabel = stripHtml(heading[1]);
    // La réponse UGC contient « cinéma » avec des accents suivant le charset.
    // On retire le compteur sans dépendre de son encodage.
    const city = cleanText(rawLabel.replace(/\s*\(\d+\s+cin[^)]*\)\s*$/i, ''), 100);
    if (!city) return;

    const block = html.slice(heading.index, headings[index + 1]?.index ?? html.length);
    const cinemaMatches = [...block.matchAll(/id="quickAccessCinema_(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const seen = new Set<string>();
    const cinemas = cinemaMatches
      .map((match) => ({ id: match[1], name: stripHtml(match[2]) }))
      // Les cinémas partenaires figurent aussi sur la page UGC : l'app ne
      // propose ici que les établissements qui portent réellement l'enseigne UGC.
      .filter((cinema) => /^ugc\b/i.test(cinema.name) && !seen.has(cinema.id) && Boolean(seen.add(cinema.id)));

    if (cinemas.length > 0) {
      cities.push({ id: normalize(city), label: city, city, cinemas });
    }
  });

  return cities;
};

const getUgcDirectory = async (): Promise<UgcCity[]> => {
  if (cachedDirectory && cachedDirectory.expiresAt > Date.now()) return cachedDirectory.cities;

  const response = await fetchWithTimeout(UGC_DIRECTORY_URL);
  if (!response.ok) throw new Error(`UGC directory ${response.status}`);
  const cities = parseUgcDirectory(await response.text());
  if (cities.length === 0) throw new Error('UGC directory parse failure');
  cachedDirectory = { cities, expiresAt: Date.now() + DIRECTORY_CACHE_MS };
  return cities;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Requête POST attendue.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > 2_000) {
    return fail(413, 'payload-too-large', 'Requête trop volumineuse.');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid-json', 'Corps JSON invalide.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return fail(503, 'server-misconfigured', 'Service indisponible.');

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') || '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'authentication-required', 'Connecte-toi pour rechercher un cinéma.');

  let directory: UgcCity[];
  try {
    directory = await getUgcDirectory();
  } catch (error) {
    console.warn('[Cinema directory] Liste UGC indisponible', error);
    return fail(503, 'ugc-directory-unavailable', 'La liste officielle UGC est momentanément indisponible.');
  }

  if (body.action === 'cities') {
    const query = normalize(cleanText(body.query, 100));
    if (query.length < 2) return fail(400, 'invalid-query', 'Saisis au moins deux lettres.');
    const items = directory
      .filter((city) => normalize(city.label).includes(query))
      .map(({ id, label, city }) => ({ id, label, city }));
    return json({ items });
  }

  if (body.action === 'cinemas') {
    const city = normalize(cleanText(body.city, 100));
    if (!city) return fail(400, 'invalid-city', 'Ville invalide.');
    const selectedCity = directory.find((entry) => entry.id === city);
    if (!selectedCity) return json({ items: [] });
    return json({
      items: selectedCity.cinemas.map((cinema) => ({
        id: cinema.id,
        name: cinema.name,
        address: selectedCity.label,
      })),
    });
  }

  return fail(400, 'invalid-action', 'Action inconnue.');
});
