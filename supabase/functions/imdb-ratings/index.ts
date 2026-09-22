import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Notes IMDb, servies depuis un cache partagé et complétées via OMDb.
 *
 * POURQUOI UN RELAIS
 * La clé OMDb gratuite plafonne à 1 000 requêtes par jour pour TOUTE l'app. Dans
 * le navigateur, elle serait publique (n'importe qui pourrait épuiser le quota)
 * et chaque visiteur repayerait les films déjà vus par d'autres. Ici, la clé
 * reste secrète et `imdb_ratings` sert tout le monde : une œuvre coûte au plus
 * une requête OMDb par semaine.
 *
 * QUI DÉPENSE LE QUOTA
 * Tout appelant lit le cache. Seul un utilisateur connecté déclenche des appels
 * OMDb : la clé anonyme est publique, elle ne doit pas suffire à vider le quota.
 * Les listes d'exploration (priorité `low`) s'arrêtent bien avant le plafond,
 * pour que les collections, qui en ont vraiment besoin, gardent de la marge.
 *
 * Secrets : OMDB_API_KEY (obligatoire pour compléter), TMDB_API_KEY (pour
 * retrouver l'identifiant IMDb quand l'app ne l'a pas fourni), OMDB_DAILY_LIMIT
 * (facultatif, 950 par défaut : un peu de marge sous les 1 000 d'OMDb).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAY_MS = 24 * 60 * 60 * 1_000;
/** Une note IMDb bouge de quelques centièmes par semaine : inutile de la redemander plus souvent. */
const RATED_TTL_MS = 7 * DAY_MS;
/** Un film sans note (pas encore sorti, confidentiel) peut en gagner une : on revérifie plus tôt. */
const UNRATED_TTL_MS = 3 * DAY_MS;
const DEFAULT_DAILY_LIMIT = 950;
/** Part du plafond que les listes d'exploration ont le droit d'entamer. */
const LOW_PRIORITY_SHARE = 0.6;
const MAX_ITEMS = 100;
const MAX_FETCH = { high: 30, low: 10 } as const;
const CONCURRENCY = 6;
const IMDB_ID = /^tt\d{6,10}$/;

type MediaType = 'movie' | 'tv';
type Priority = keyof typeof MAX_FETCH;
type Item = { mediaType: MediaType; tmdbId: number; imdbId?: string };
type Row = {
  media_type: MediaType;
  tmdb_id: number;
  imdb_id: string | null;
  rating: number | null;
  votes: number | null;
  fetched_at: string | null;
};
type Answer = { mediaType: MediaType; tmdbId: number; imdbId: string | null; rating: number | null; votes: number | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const keyOf = (mediaType: string, tmdbId: number) => `${mediaType}:${tmdbId}`;

const parseItems = (raw: unknown): Item[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { mediaType, tmdbId, imdbId } = entry as Record<string, unknown>;
    if (mediaType !== 'movie' && mediaType !== 'tv') continue;
    if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || tmdbId <= 0) continue;
    const key = keyOf(mediaType, tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ mediaType, tmdbId, imdbId: typeof imdbId === 'string' && IMDB_ID.test(imdbId) ? imdbId : undefined });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
};

const isFresh = (row: Row | undefined) => {
  if (!row?.fetched_at) return false;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  return age < (row.rating != null ? RATED_TTL_MS : UNRATED_TTL_MS);
};

const fetchJson = async (url: string, timeoutMs = 8_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    return { status: response.status, body: body as Record<string, unknown> | null };
  } finally {
    clearTimeout(timer);
  }
};

/** L'identifiant IMDb d'une œuvre TMDB ; `null` quand TMDB n'en connaît pas, `undefined` si on n'a pas pu savoir. */
const resolveImdbId = async (item: Item, tmdbKey: string | undefined): Promise<string | null | undefined> => {
  if (!tmdbKey) return undefined;
  try {
    const { status, body } = await fetchJson(
      `https://api.themoviedb.org/3/${item.mediaType}/${item.tmdbId}/external_ids?api_key=${encodeURIComponent(tmdbKey)}`
    );
    if (status === 404) return null;
    if (status !== 200 || !body) return undefined;
    const id = body.imdb_id;
    return typeof id === 'string' && IMDB_ID.test(id) ? id : null;
  } catch {
    return undefined;
  }
};

type OmdbOutcome =
  | { kind: 'ok'; rating: number | null; votes: number | null }
  /** Quota épuisé ou clé refusée : inutile d'insister, rien n'est mis en cache. */
  | { kind: 'stop' }
  /** Panne passagère : on n'écrit rien, la prochaine demande réessaiera. */
  | { kind: 'skip' };

const askOmdb = async (imdbId: string, omdbKey: string): Promise<OmdbOutcome> => {
  try {
    const { status, body } = await fetchJson(
      `https://www.omdbapi.com/?i=${imdbId}&apikey=${encodeURIComponent(omdbKey)}`
    );
    if (!body) return { kind: 'skip' };
    if (body.Response === 'False') {
      const error = String(body.Error ?? '');
      if (status === 401 || /limit|api key/i.test(error)) {
        console.error('[imdb-ratings] OMDb refuse la clé :', error);
        return { kind: 'stop' };
      }
      // « Incorrect IMDb ID », « Movie not found » : réponse définitive, sans note.
      return { kind: 'ok', rating: null, votes: null };
    }
    if (status !== 200) return { kind: 'skip' };
    const rating = Number.parseFloat(String(body.imdbRating));
    const votes = Number.parseInt(String(body.imdbVotes).replace(/[^\d]/g, ''), 10);
    return {
      kind: 'ok',
      rating: Number.isFinite(rating) && rating > 0 && rating <= 10 ? Math.round(rating * 10) / 10 : null,
      votes: Number.isFinite(votes) && votes > 0 ? votes : null,
    };
  } catch {
    return { kind: 'skip' };
  }
};

const toAnswer = (row: Row): Answer => ({
  mediaType: row.media_type,
  tmdbId: row.tmdb_id,
  imdbId: row.imdb_id,
  rating: row.rating == null ? null : Number(row.rating),
  votes: row.votes,
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }
  const items = parseItems(body.items);
  if (items.length === 0) return json({ items: [] });
  const priority: Priority = body.priority === 'low' ? 'low' : 'high';

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Le cache, pour tout le monde.
  const tmdbIds = [...new Set(items.map((item) => item.tmdbId))];
  const { data: cachedRows, error: cacheError } = await asService
    .from('imdb_ratings')
    .select('media_type, tmdb_id, imdb_id, rating, votes, fetched_at')
    .in('tmdb_id', tmdbIds);
  if (cacheError) {
    console.error('[imdb-ratings] Lecture du cache :', cacheError.message);
    return fail(503, 'upstream', 'Notes IMDb momentanément indisponibles.');
  }
  const cache = new Map<string, Row>();
  (cachedRows as Row[] | null)?.forEach((row) => cache.set(keyOf(row.media_type, row.tmdb_id), row));

  const answers = new Map<string, Answer>();
  const toRefresh: Item[] = [];
  for (const item of items) {
    const row = cache.get(keyOf(item.mediaType, item.tmdbId));
    // Une note un peu ancienne vaut mieux que rien : elle est rendue tout de
    // suite, et remplacée plus bas si le quota permet de la rafraîchir.
    if (row?.fetched_at) answers.set(keyOf(item.mediaType, item.tmdbId), toAnswer(row));
    if (!isFresh(row)) toRefresh.push({ ...item, imdbId: item.imdbId ?? row?.imdb_id ?? undefined });
  }

  // 2. Compléter via OMDb, seulement pour un utilisateur connecté.
  const omdbKey = Deno.env.get('OMDB_API_KEY');
  if (toRefresh.length > 0) {
    const asCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: userData } = await asCaller.auth.getUser();

    if (userData?.user && !omdbKey) {
      // Explicite dans les journaux : c'est l'oubli du premier déploiement.
      console.error('[imdb-ratings] OMDB_API_KEY absente des secrets de la fonction.');
    }

    if (userData?.user && omdbKey) {
      const tmdbKey = Deno.env.get('TMDB_API_KEY') ?? undefined;
      const dailyLimit = Number(Deno.env.get('OMDB_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
      const limit = priority === 'low' ? Math.floor(dailyLimit * LOW_PRIORITY_SHARE) : dailyLimit;
      const queue = toRefresh.slice(0, MAX_FETCH[priority]);
      const upserts: Row[] = [];
      let stopped = false;

      const work = async (item: Item) => {
        if (stopped) return;
        let imdbId: string | null | undefined = item.imdbId;
        if (!imdbId) imdbId = await resolveImdbId(item, tmdbKey);
        if (imdbId === undefined) return;

        const now = new Date().toISOString();
        if (imdbId === null) {
          // TMDB ne connaît aucun identifiant IMDb : réponse définitive, sans rien coûter à OMDb.
          upserts.push({ media_type: item.mediaType, tmdb_id: item.tmdbId, imdb_id: null, rating: null, votes: null, fetched_at: now });
          return;
        }
        if (stopped) return;

        const { data: allowed, error } = await asService.rpc('consume_omdb_quota', { p_limit: limit });
        if (error || allowed !== true) {
          if (error) console.error('[imdb-ratings] consume_omdb_quota :', error.message);
          stopped = true;
          // L'identifiant résolu reste utile : on le garde, sans marquer la note comme lue.
          const previous = cache.get(keyOf(item.mediaType, item.tmdbId));
          upserts.push({
            media_type: item.mediaType,
            tmdb_id: item.tmdbId,
            imdb_id: imdbId,
            rating: previous?.rating ?? null,
            votes: previous?.votes ?? null,
            fetched_at: previous?.fetched_at ?? null,
          });
          return;
        }

        const outcome = await askOmdb(imdbId, omdbKey);
        if (outcome.kind === 'stop') {
          stopped = true;
          return;
        }
        if (outcome.kind === 'skip') return;
        upserts.push({
          media_type: item.mediaType,
          tmdb_id: item.tmdbId,
          imdb_id: imdbId,
          rating: outcome.rating,
          votes: outcome.votes,
          fetched_at: now,
        });
      };

      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          while (cursor < queue.length && !stopped) await work(queue[cursor++]);
        })
      );

      if (upserts.length > 0) {
        const { error } = await asService.from('imdb_ratings').upsert(upserts, { onConflict: 'media_type,tmdb_id' });
        if (error) console.error('[imdb-ratings] Écriture du cache :', error.message);
        upserts.forEach((row) => {
          if (row.fetched_at) answers.set(keyOf(row.media_type, row.tmdb_id), toAnswer(row));
        });
      }
    }
  }

  // Les œuvres absentes de la réponse n'ont pas pu être traitées cette fois
  // (quota, visiteur non connecté, panne) : l'app gardera la note TMDB.
  return json({ items: [...answers.values()] });
});
