import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { FilmQuery, Order, PublicReview, blueskyQueries, fromBlueskyPost, fromYoutubeThread, mentionsFilm, rankReviews } from './logic.ts';
import {
  Facts,
  MAX_BSKY_SOURCES,
  MAX_SC_SOURCES,
  MIN_REVIEWS,
  Source,
  Summary,
  fromSensCritique,
  parseOmdb,
  parseSummary,
  positiveShare,
  summaryPrompt,
} from './summary.ts';

/**
 * Les avis du public sur un film : commentaires YouTube de sa bande-annonce,
 * posts Bluesky qui en parlent, et leur traduction à la demande.
 *
 * Cinq actions, en POST :
 * - `youtube`  { videoKey, order }           → { items, total, disabled? }
 * - `bluesky`  { titles, director?, year?, since?, order } → { items }
 * - `translate` { items: [{ id, text }], target } → { items: [{ id, text, source }] }
 * - `facts`    { tmdbId, imdbId?, titles, director?, year? } → { facts }
 * - `summary`  { …comme facts, target } → { facts, summary, few? }
 *
 * `facts` : notes SensCritique (id par Wikidata, API publique non officielle),
 * IMDb et presse (OMDb), part des critiques à 7/10 ou plus, volumes. `summary` :
 * le résumé écrit par Mistral à partir des critiques SensCritique et des posts
 * Bluesky (voir summary.ts), gardé un jour par film et par langue.
 *
 * On ne garde rien en base : les réponses restent quelques heures dans la
 * mémoire de la fonction, et l'app les garde de son côté. Un avis supprimé sur
 * sa plateforme disparaît donc d'ici au plus tard le lendemain.
 *
 * Qui dépense quoi : YouTube (quota de 10 000 unités par jour, 2 par appel) et
 * Mistral ne servent qu'un utilisateur connecté ; la clé anonyme est publique.
 * Bluesky est ouvert et sans clé.
 *
 * Secrets : YOUTUBE_API_KEY (sans elle, pas de commentaires YouTube),
 * MISTRAL_API_KEY (déjà utilisée par `ai` et `review-voice`).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const HOUR = 3600_000;
const LIST_TTL = 6 * HOUR;
const TRANSLATION_TTL = 48 * HOUR;
const CACHE_MAX = 600;
const TIMEOUT_MS = 8000;
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;
const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
/** Les mêmes que `ai` et `review-voice` : `mistral-small-latest` est hors forfait. */
const CHAT_MODELS = ['ministral-8b-latest', 'ministral-14b-latest'];
const MAX_TRANSLATE_ITEMS = 10;
const MAX_TRANSLATE_CHARS = 1500;
/** Traductions par personne et par jour, dans la mémoire de la fonction : un garde-fou, pas un compteur exact. */
const DAILY_TRANSLATIONS = 300;

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
const remember = <T>(key: string, ttl: number, value: T): T => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), ttl, value });
  return value;
};
const recall = <T>(key: string): T | undefined => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
};

const usage = new Map<string, { day: string; count: number }>();
const spend = (userId: string, n: number, limit = DAILY_TRANSLATIONS) => {
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(userId);
  const count = entry?.day === day ? entry.count : 0;
  if (count + n > limit) return false;
  usage.set(userId, { day, count: count + n });
  return true;
};

const order = (raw: unknown): Order => (raw === 'recent' ? 'recent' : 'relevance');

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

/* ------------------------------------------------------------------ YouTube */

async function youtube(videoKey: string, sort: Order) {
  const cacheKey = `yt:${videoKey}:${sort}`;
  const cached = recall<unknown>(cacheKey);
  if (cached) return cached;

  const key = Deno.env.get('YOUTUBE_API_KEY');
  if (!key) {
    console.error('[public-reviews] YOUTUBE_API_KEY absente des secrets.');
    return { items: [], total: null, unavailable: true };
  }
  const base = 'https://www.googleapis.com/youtube/v3';
  const threads = new URLSearchParams({
    part: 'snippet',
    videoId: videoKey,
    maxResults: '100',
    order: sort === 'recent' ? 'time' : 'relevance',
    textFormat: 'plainText',
    key,
  });
  const stats = new URLSearchParams({ part: 'statistics', id: videoKey, key });
  const [list, video] = await Promise.all([
    getJson(`${base}/commentThreads?${threads}`),
    getJson(`${base}/videos?${stats}`),
  ]);
  const total = Number(video.body?.items?.[0]?.statistics?.commentCount);

  if (!list.ok) {
    const reason = list.body?.error?.errors?.[0]?.reason;
    if (reason === 'commentsDisabled') return remember(cacheKey, LIST_TTL, { items: [], total: 0, disabled: true });
    console.warn(`[public-reviews] YouTube ${list.status} ${reason ?? ''}`);
    return { items: [], total: Number.isFinite(total) ? total : null, unavailable: true };
  }
  const candidates = (list.body?.items ?? [])
    .map((thread: unknown) => fromYoutubeThread(thread, videoKey))
    .filter(Boolean) as PublicReview[];
  return remember(cacheKey, LIST_TTL, {
    items: rankReviews(candidates, sort),
    total: Number.isFinite(total) ? total : null,
  });
}

/* ------------------------------------------------------------------ Bluesky */

async function bluesky(film: FilmQuery, sort: Order, since?: string) {
  const cacheKey = `bsky:${film.titles.join('|')}:${film.year ?? ''}:${sort}:${since ?? ''}`;
  const cached = recall<unknown>(cacheKey);
  if (cached) return cached;

  const pages = await Promise.all(
    blueskyQueries(film).map((q) => {
      const params = new URLSearchParams({ q, limit: '100', sort: sort === 'recent' ? 'latest' : 'top' });
      if (since) params.set('since', since);
      return getJson(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`).catch(() => null);
    })
  );
  const candidates: PublicReview[] = [];
  for (const page of pages) {
    if (!page?.ok) {
      if (page) console.warn(`[public-reviews] Bluesky ${page.status}`);
      continue;
    }
    for (const post of page.body?.posts ?? []) {
      const review = fromBlueskyPost(post);
      if (review && mentionsFilm(review.text, film)) candidates.push(review);
    }
  }
  return remember(cacheKey, LIST_TTL, { items: rankReviews(candidates, sort) });
}

/* ------------------------------------------- Ce qu'en dit Internet (résumé) */

const DAY = 24 * HOUR;
const UA = 'TheBitter/1.0 (https://thebitter.watch)';
const SUMMARY_MODELS = ['ministral-14b-latest', 'ministral-8b-latest'];
/** Résumés par personne et par jour : un garde-fou, chaque film est gardé en cache. */
const DAILY_SUMMARIES = 60;

/** L'identifiant SensCritique d'un film, par Wikidata (P4947 TMDB → P10100). */
async function sensCritiqueId(tmdbId: number): Promise<number | null> {
  const key = `scid:${tmdbId}`;
  const cached = recall<number>(key);
  if (cached !== undefined) return cached || null;
  const query = `SELECT ?sc WHERE { ?f wdt:P4947 "${tmdbId}"; wdt:P10100 ?sc. } LIMIT 1`;
  try {
    const { ok, body } = await getJson(`https://query.wikidata.org/sparql?${new URLSearchParams({ query })}`, {
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
    });
    const id = ok ? Number(body?.results?.bindings?.[0]?.sc?.value) : NaN;
    if (!ok) return null;
    return remember(key, Number.isFinite(id) ? 7 * DAY : DAY, Number.isFinite(id) ? id : 0) || null;
  } catch {
    return null;
  }
}

/** La fiche SensCritique : note, volumes, et jusqu'à 300 critiques (texte des 100 plus lues). */
async function sensCritique(id: number) {
  const query = `query { product(id: ${id}) { url rating stats { ratingCount reviewCount }
    p0: reviews(limit: 100, offset: 0) { items { id title bodyShort rating } }
    p1: reviews(limit: 100, offset: 100) { items { rating } }
    p2: reviews(limit: 100, offset: 200) { items { rating } } } }`;
  const { ok, body } = await getJson('https://apollo.senscritique.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  });
  const product = ok ? body?.data?.product : null;
  if (!product) return null;
  const url = `https://www.senscritique.com${typeof product.url === 'string' ? product.url : `/film/_/${id}`}`;
  const first: any[] = product.p0?.items ?? [];
  const ratings = [...first, ...(product.p1?.items ?? []), ...(product.p2?.items ?? [])].map((r: any) => r?.rating);
  const { share, sampled } = positiveShare(ratings);
  return {
    facts: {
      rating: typeof product.rating === 'number' ? product.rating : null,
      ratings: Number(product.stats?.ratingCount) || 0,
      reviews: Number(product.stats?.reviewCount) || 0,
      positiveShare: share,
      sampled,
      url,
    },
    sources: first.map((item) => fromSensCritique(item, url)).filter(Boolean) as Source[],
  };
}

async function omdb(imdbId: string | undefined) {
  const key = Deno.env.get('OMDB_API_KEY');
  if (!imdbId || !key) return { imdb: null, press: null };
  const cacheKey = `omdb:${imdbId}`;
  const cached = recall<ReturnType<typeof parseOmdb>>(cacheKey);
  if (cached) return cached;
  try {
    const { ok, body } = await getJson(`https://www.omdbapi.com/?${new URLSearchParams({ apikey: key, i: imdbId })}`);
    return ok ? remember(cacheKey, DAY, parseOmdb(body)) : { imdb: null, press: null };
  } catch {
    return { imdb: null, press: null };
  }
}

interface FilmInput extends FilmQuery {
  tmdbId: number;
  imdbId?: string;
}

/**
 * Ce que l'app ne sait pas toujours (depuis le fil : ni IMDb, ni réalisateur,
 * ni titre d'origine) : TMDB le complète, une fois par film.
 */
async function complete(film: FilmInput): Promise<FilmInput> {
  if (film.imdbId && film.director && film.titles.length > 1) return film;
  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) return film;
  const cacheKey = `tmdb:${film.tmdbId}`;
  let info = recall<{ imdbId?: string; director?: string; original?: string; year?: string }>(cacheKey);
  if (!info) {
    try {
      const { ok, body } = await getJson(
        `https://api.themoviedb.org/3/movie/${film.tmdbId}?${new URLSearchParams({ api_key: key, append_to_response: 'credits,external_ids' })}`
      );
      if (!ok) return film;
      info = remember(cacheKey, 7 * DAY, {
        imdbId: typeof body?.imdb_id === 'string' && /^tt\d{6,10}$/.test(body.imdb_id) ? body.imdb_id : undefined,
        director: body?.credits?.crew?.find((c: any) => c?.job === 'Director')?.name,
        original: typeof body?.original_title === 'string' ? body.original_title : undefined,
        year: typeof body?.release_date === 'string' ? body.release_date.slice(0, 4) : undefined,
      });
    } catch {
      return film;
    }
  }
  return {
    ...film,
    imdbId: film.imdbId ?? info.imdbId,
    director: film.director ?? info.director,
    year: film.year ?? info.year,
    titles: [...new Set([...film.titles, info.original].filter(Boolean) as string[])].slice(0, 2),
  };
}

/** Les chiffres, et les avis qui serviront au résumé (gardés côté serveur). */
async function gather(input: FilmInput): Promise<{ facts: Facts; sources: Source[] }> {
  const cacheKey = `facts:${input.tmdbId}`;
  const cached = recall<{ facts: Facts; sources: Source[] }>(cacheKey);
  if (cached) return cached;
  const film = await complete(input);
  const [sc, notes, bsky] = await Promise.all([
    sensCritiqueId(film.tmdbId)
      .then((id) => (id ? sensCritique(id) : null))
      .catch((error) => {
        console.warn('[public-reviews] SensCritique :', String(error));
        return null;
      }),
    omdb(film.imdbId),
    bluesky(film, 'relevance').catch(() => ({ items: [] })) as Promise<{ items: PublicReview[] }>,
  ]);
  const bskySources: Source[] = (bsky.items ?? []).slice(0, MAX_BSKY_SOURCES).map((r) => ({
    id: `B${r.id.slice(-12)}`,
    origin: 'bluesky',
    author: r.handle ?? r.author,
    text: r.text.slice(0, 420),
    url: r.url,
  }));
  const scSources = (sc?.sources ?? []).slice(0, MAX_SC_SOURCES);
  const sources = [...scSources, ...bskySources];
  const facts: Facts = {
    sensCritique: sc?.facts ?? null,
    imdb: notes.imdb,
    press: notes.press,
    bluesky: bsky.items?.length ?? 0,
    readable: sources.length,
  };
  return remember(cacheKey, 12 * HOUR, { facts, sources });
}

async function summarize(film: FilmInput, target: 'fr' | 'en', apiKey: string): Promise<{ facts: Facts; summary: Summary | null; few?: boolean }> {
  const cacheKey = `summary:${film.tmdbId}:${target}`;
  const cached = recall<{ facts: Facts; summary: Summary | null; few?: boolean }>(cacheKey);
  if (cached) return cached;
  const { facts, sources } = await gather(film);
  if (sources.length < MIN_REVIEWS) return remember(cacheKey, 6 * HOUR, { facts, summary: null, few: true });

  const { system, user } = summaryPrompt({ title: film.titles[0], year: film.year }, sources, target);
  for (const model of SUMMARY_MODELS) {
    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: 1400,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        console.warn(`[public-reviews] résumé ${model} ${response.status}`);
        if (response.status === 429 || response.status >= 500) continue;
        break;
      }
      const payload = await response.json();
      const summary = parseSummary(String(payload?.choices?.[0]?.message?.content ?? ''), sources);
      if (summary) return remember(cacheKey, DAY, { facts, summary });
      console.warn(`[public-reviews] résumé ${model} illisible`);
    } catch (error) {
      console.warn(`[public-reviews] résumé abandonné (${model}) :`, String(error));
    }
  }
  return { facts, summary: null };
}

const filmInput = (body: Record<string, unknown>): FilmInput | null => {
  const tmdbId = Number(body.tmdbId);
  const titles = cleanTitles(body.titles);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || titles.length === 0) return null;
  return {
    tmdbId,
    imdbId: typeof body.imdbId === 'string' && /^tt\d{6,10}$/.test(body.imdbId) ? body.imdbId : undefined,
    titles,
    director: typeof body.director === 'string' ? body.director.slice(0, 80) : undefined,
    year: typeof body.year === 'string' && /^\d{4}$/.test(body.year) ? body.year : undefined,
  };
};

/* --------------------------------------------------------------- Traduction */

const LANGUAGE_NAME: Record<string, string> = { fr: 'French', en: 'English' };

async function translate(items: { id: string; text: string }[], target: string, apiKey: string) {
  const out: { id: string; text: string; source: string }[] = [];
  const missing: { id: string; text: string }[] = [];
  for (const item of items) {
    const hit = recall<{ text: string; source: string }>(`tr:${target}:${item.text}`);
    if (hit) out.push({ id: item.id, ...hit });
    else missing.push(item);
  }
  if (missing.length === 0) return out;

  const system =
    `You translate short public comments about films and series into ${LANGUAGE_NAME[target]}. ` +
    'Keep the meaning, tone, slang and emojis; never add, explain or censor anything; keep names and titles as they are. ' +
    'Answer with JSON only: {"items":[{"id":"<same id>","source":"<ISO 639-1 code of the original language>","text":"<translation>"}]}.';
  const user = JSON.stringify({ items: missing });

  for (const model of CHAT_MODELS) {
    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        console.warn(`[public-reviews] ${model} ${response.status}`);
        if (response.status === 429 || response.status >= 500) continue;
        break;
      }
      const payload = await response.json();
      const parsed = JSON.parse(String(payload?.choices?.[0]?.message?.content ?? '{}'));
      const byId = new Map(missing.map((item) => [item.id, item]));
      for (const entry of Array.isArray(parsed?.items) ? parsed.items : []) {
        const original = byId.get(String(entry?.id));
        const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
        if (!original || !text) continue;
        const source = typeof entry?.source === 'string' && /^[a-z]{2,3}$/i.test(entry.source) ? entry.source.toLowerCase() : 'und';
        remember(`tr:${target}:${original.text}`, TRANSLATION_TTL, { text, source });
        out.push({ id: original.id, text, source });
      }
      return out;
    } catch (error) {
      console.warn(`[public-reviews] traduction abandonnée (${model}) :`, String(error));
    }
  }
  return out;
}

/* ------------------------------------------------------------------- Entrée */

const cleanTitles = (raw: unknown): string[] =>
  [...new Set((Array.isArray(raw) ? raw : []).map((t) => String(t ?? '').replace(/"/g, '').trim()).filter((t) => t.length >= 2 && t.length <= 120))].slice(0, 2);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'body', 'Corps JSON attendu.');
  }
  const action = body?.action;

  if (action === 'bluesky') {
    const titles = cleanTitles(body.titles);
    if (titles.length === 0) return fail(400, 'titles', 'Titre manquant.');
    const year = typeof body.year === 'string' && /^\d{4}$/.test(body.year) ? body.year : undefined;
    const director = typeof body.director === 'string' ? body.director.slice(0, 80) : undefined;
    const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? `${body.since}T00:00:00Z` : undefined;
    try {
      return json(await bluesky({ titles, director, year }, order(body.order), since));
    } catch (error) {
      console.warn('[public-reviews] Bluesky :', String(error));
      return json({ items: [] });
    }
  }

  // YouTube et Mistral coûtent : il faut être quelqu'un.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return fail(401, 'auth', 'Connexion requise.');

  if (action === 'youtube') {
    const videoKey = String(body.videoKey ?? '');
    if (!YOUTUBE_KEY.test(videoKey)) return fail(400, 'video', 'Vidéo inconnue.');
    try {
      return json(await youtube(videoKey, order(body.order)));
    } catch (error) {
      console.warn('[public-reviews] YouTube :', String(error));
      return json({ items: [], total: null, unavailable: true });
    }
  }

  if (action === 'facts' || action === 'summary') {
    const film = filmInput(body);
    if (!film) return fail(400, 'film', 'Film inconnu.');
    try {
      if (action === 'facts') return json({ facts: (await gather(film)).facts });
      const apiKey = Deno.env.get('MISTRAL_API_KEY');
      if (!apiKey) return json({ facts: (await gather(film)).facts, summary: null });
      const target = body.target === 'en' ? 'en' : 'fr';
      if (!recall(`summary:${film.tmdbId}:${target}`) && !spend(`summary:${userId}`, 1, DAILY_SUMMARIES)) {
        return json({ facts: (await gather(film)).facts, summary: null, limited: true });
      }
      return json(await summarize(film, target, apiKey));
    } catch (error) {
      console.warn('[public-reviews] résumé :', String(error));
      return json({ facts: null, summary: null });
    }
  }

  if (action === 'translate') {
    const target = body.target === 'en' ? 'en' : 'fr';
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((item) => ({ id: String((item as any)?.id ?? '').slice(0, 300), text: String((item as any)?.text ?? '').slice(0, MAX_TRANSLATE_CHARS) }))
      .filter((item) => item.id && item.text.trim())
      .slice(0, MAX_TRANSLATE_ITEMS);
    if (items.length === 0) return json({ items: [] });
    const apiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!apiKey) {
      console.error('[public-reviews] MISTRAL_API_KEY absente des secrets.');
      return fail(503, 'unavailable', 'Traduction indisponible.');
    }
    if (!spend(userId, items.length)) return fail(429, 'limit', 'Assez traduit pour aujourd’hui.');
    return json({ items: await translate(items, target, apiKey) });
  }

  return fail(400, 'action', 'Action inconnue.');
});
