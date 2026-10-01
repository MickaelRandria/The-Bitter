import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { introducedNames, makingOfSections, parseTrivia, TriviaItem, visibleTrivia } from './logic.ts';
import { buildDataQuiz, MIN_DATA_QUESTIONS, SeriesFacts } from './quiz.ts';

/**
 * « Le saviez-vous + » : anecdotes et quiz sur la fabrication d'une série.
 *
 * LE QUIZ vient d'abord des bases de données (Wikidata, TMDB), sans IA : voir
 * quiz.ts. Mistral n'écrit des questions que pour une série trop peu
 * documentée pour une manche complète, et elles sont alors marquées comme
 * telles (`origin: 'ai'`), pour que l'écran le dise.
 *
 * LES ANECDOTES viennent de Wikipédia, réécrites par Mistral (logic.ts).
 *
 * Tout est préparé une fois par série et par langue, sur un geste explicite
 * (`generate: true`), puis gardé dans `series_trivia` pour tout le monde. Sans
 * ce geste, la fonction ne fait que lire le cache. Le filtre de saison et de
 * noms s'applique à chaque lecture, selon où en est la personne.
 */

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'ministral-14b-latest';
const DEFAULT_DAILY_LIMIT = 40;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const USER_AGENT = 'TheBitter/1.0 (https://thebitter.watch; contact via app)';
/** Une série sans anecdote est réessayée au bout d'un mois : Wikipédia s'enrichit. */
const EMPTY_RETRY_DAYS = 30;
/** Au-delà, le casting saison par saison coûte trop d'appels pour ce qu'il protège. */
const MAX_SEASONS = 25;
/**
 * Une génération lit 10 à 15 000 caractères et en écrit un millier : avec un
 * Ministral, 30 à 50 secondes. Elle n'a lieu qu'une fois par série.
 */
const UPSTREAM_TIMEOUT_MS = 100_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const resolveModel = () => {
  const configured = (Deno.env.get('MISTRAL_MODEL') ?? '').trim();
  return configured && !/[\s=]/.test(configured) ? configured : DEFAULT_MODEL;
};

const getJson = async (url: string, timeout = 12_000) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`${response.status} ${url.split('?')[0]}`);
  return response.json();
};

const sparql = (query: string) =>
  getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);

/** Les articles Wikipédia d'une série, par son identifiant TMDB (Wikidata P4983). */
async function wikipediaTitles(tmdbId: number): Promise<{ fr?: string; en?: string }> {
  const data = await sparql(`SELECT ?fr ?en WHERE { ?item wdt:P4983 "${tmdbId}".
    OPTIONAL { ?fr schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>. }
    OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. } } LIMIT 1`);
  const row = data?.results?.bindings?.[0] ?? {};
  const title = (url?: string) => (url ? decodeURIComponent(url.split('/wiki/')[1] ?? '') : undefined);
  return { fr: title(row.fr?.value), en: title(row.en?.value) };
}

/** Les faits de fabrication que Wikidata connaît : créateurs, musique, diffusion, tournage, pays, prix. */
async function wikidataFacts(tmdbId: number, language: 'fr' | 'en') {
  const data = await sparql(`SELECT ?p ?valueLabel WHERE { ?item wdt:P4983 "${tmdbId}".
    VALUES ?p { wdt:P170 wdt:P86 wdt:P449 wdt:P915 wdt:P495 wdt:P166 }
    ?item ?p ?value.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${language === 'fr' ? 'fr,en' : 'en,fr'}". } }`);
  const facts: Record<string, string[]> = {};
  for (const row of data?.results?.bindings ?? []) {
    const property = String(row.p?.value ?? '').split('/').pop() ?? '';
    const label = String(row.valueLabel?.value ?? '');
    if (!property || !label) continue;
    const values = (facts[property] ??= []);
    if (!values.includes(label)) values.push(label);
  }
  return facts;
}

async function wikipediaExtract(lang: 'fr' | 'en', title: string): Promise<string> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'wiki',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    titles: title,
  });
  const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return data?.query?.pages?.[0]?.extract ?? '';
}

type Role = { character: string; actor: string };

/** Pour chaque saison, ses rôles réguliers (TMDB). */
async function castBySeason(tmdbId: number, seasons: number[], tmdbKey: string) {
  const bySeason: Record<number, Role[]> = {};
  const queue = [...seasons];
  const worker = async () => {
    for (let season = queue.shift(); season != null; season = queue.shift()) {
      try {
        const data = await getJson(`${TMDB_BASE}/tv/${tmdbId}/season/${season}/credits?api_key=${tmdbKey}`);
        bySeason[season] = (data?.cast ?? [])
          .filter((c: { character?: string; name?: string }) => c.character && c.name)
          .map((c: { character: string; name: string }) => ({
            character: c.character.split(' / ')[0],
            actor: c.name,
          }));
      } catch {
        bySeason[season] = [];
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return bySeason;
}

type TmdbSeries = {
  name?: string;
  first_air_date?: string;
  created_by?: { name: string }[];
  networks?: { name: string }[];
  seasons?: { season_number: number; episode_count: number }[];
};

const regularSeasons = (series: TmdbSeries) =>
  (series.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .map((s) => s.season_number)
    .sort((a, b) => a - b)
    .slice(0, MAX_SEASONS);

/** Le quiz sans IA : Wikidata d'abord, TMDB pour ce qu'il ne sait pas, et la distribution de la saison 1. */
async function dataQuiz(tmdbId: number, series: TmdbSeries, bySeason: Record<number, Role[]>, language: 'fr' | 'en') {
  const wd = await wikidataFacts(tmdbId, language).catch(() => ({}) as Record<string, string[]>);
  const first = regularSeasons(series)[0];
  const facts: SeriesFacts = {
    title: series.name ?? '',
    creators: wd.P170 ?? (series.created_by ?? []).map((c) => c.name),
    composers: wd.P86 ?? [],
    networks: wd.P449 ?? (series.networks ?? []).map((n) => n.name),
    locations: wd.P915 ?? [],
    countries: wd.P495 ?? [],
    awards: wd.P166 ?? [],
    year: series.first_air_date ? Number(series.first_air_date.slice(0, 4)) : undefined,
    cast: first != null ? (bySeason[first] ?? []).slice(0, 10) : [],
  };
  return facts.title ? buildDataQuiz(facts, language) : [];
}

const persona = (language: 'fr' | 'en', title: string, withQuiz: boolean) => `Tu prépares des anecdotes de coulisses sur la série « ${title} », à lire pendant qu'on regarde un épisode.

Tu reçois des extraits de Wikipédia (français et/ou anglais) sur la FABRICATION de la série : création, écriture, casting, tournage, musique, décors. Ce sont tes SEULES sources.

RÈGLES ABSOLUES :
- N'utilise QUE les faits présents dans les extraits. N'ajoute rien de ta mémoire. Pas de chiffre, de nom ou de date absent des extraits.
- AUCUN SPOILER : ne dis jamais ce qui arrive aux personnages (intrigue, morts, départs, révélations, retournements, fins de saison). Parle de la fabrication, pas de l'histoire.
- Ne nomme un personnage que si c'est indispensable, et jamais pour dire ce qu'il devient.
- Ne cite AUCUN titre d'épisode, et aucun numéro de saison ou d'épisode qui ne figure pas mot pour mot dans l'extrait.
- Reste au plus près de la formulation de la source : reformule, n'interprète pas.
- Indique pour chaque élément la saison qu'il concerne (nombre), ou null s'il concerne la série en général.
- Indique "source": "fr" ou "en" selon l'extrait d'où vient le fait.

À PRODUIRE, en ${language === 'fr' ? 'français' : 'anglais'}, ton vivant et précis :
- 5 à 8 anecdotes ("type": "fact"), une ou deux phrases chacune, 220 caractères maximum, qui commencent directement par le fait (pas de « Saviez-vous que »).
${
  withQuiz
    ? `- 6 à 8 questions de quiz ("type": "quiz") sur ces mêmes faits : "question", exactement 3 "options" courtes et plausibles, "answer" (index 0, 1 ou 2 de la bonne réponse, à varier), "explanation" (une phrase qui donne la réponse).`
    : `- AUCUNE question de quiz : seulement des anecdotes.`
}
- Si les extraits ne contiennent presque rien d'intéressant, renvoie moins d'éléments, voire une liste vide. Mieux vaut rien qu'une anecdote fade ou inventée.

Réponds UNIQUEMENT en JSON, exactement sous cette forme :
{"items": [
  {"type": "fact", "season": null, "text": "…", "source": "en"}${
    withQuiz
      ? `,
  {"type": "quiz", "season": 2, "question": "…", "options": ["…", "…", "…"], "answer": 1, "explanation": "…", "source": "fr"}`
      : ''
  }
]}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

  // Comme `ai` : la clé anonyme est un JWT valide et publique, il faut une vraie session.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (!user) return fail(401, 'unauthenticated', 'Connecte-toi pour voir les anecdotes.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }
  const tmdbId = Number(body.tmdbId);
  const season = Number(body.season);
  const language: 'fr' | 'en' = body.language === 'en' ? 'en' : 'fr';
  /**
   * Générer coûte un appel Mistral : seulement sur un geste explicite (« Le
   * saviez-vous + »). Sans lui, la fonction ne fait que lire le cache et dit
   * s'il y a quelque chose à montrer, sans rien dépenser.
   */
  const generate = body.generate === true;
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season < 1 || season > 200) {
    return fail(400, 'bad_request', 'Série ou saison invalide.');
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  const reply = (items: TriviaItem[], introduced: Record<number, string[]>, sources: unknown) => {
    const visible = visibleTrivia(items, introduced, season);
    return json({ status: visible.length ? 'ready' : 'empty', items: visible, sources: sources ?? {} });
  };

  const { data: cached } = await admin
    .from('series_trivia')
    .select('items, introduced, sources, created_at, quiz_origin')
    .eq('tmdb_id', tmdbId)
    .eq('language', language)
    .maybeSingle();
  const fresh =
    cached &&
    ((Array.isArray(cached.items) && cached.items.length > 0) ||
      Date.now() - Date.parse(cached.created_at) < EMPTY_RETRY_DAYS * 86_400_000);

  if (fresh) {
    let items = cached.items as TriviaItem[];
    /*
     * Une série préparée avant le quiz sans IA n'a que les questions de
     * Mistral. Au prochain geste, on construit celui des bases de données (sans
     * Mistral, donc sans quota) et il remplace l'ancien s'il fait une manche.
     */
    if (generate && cached.quiz_origin == null && tmdbKey) {
      try {
        const series: TmdbSeries = await getJson(
          `${TMDB_BASE}/tv/${tmdbId}?api_key=${tmdbKey}&language=${language === 'fr' ? 'fr-FR' : 'en-US'}`
        );
        const first = regularSeasons(series)[0];
        const cast = first != null ? await castBySeason(tmdbId, [first], tmdbKey) : {};
        const quiz = await dataQuiz(tmdbId, series, cast, language);
        const origin = quiz.length >= MIN_DATA_QUESTIONS ? 'data' : 'ai';
        if (origin === 'data') items = [...items.filter((i) => i.type === 'fact'), ...quiz];
        await admin
          .from('series_trivia')
          .update({ items, quiz_origin: origin })
          .eq('tmdb_id', tmdbId)
          .eq('language', language);
      } catch (error) {
        console.error('[series-trivia] quiz des bases :', error instanceof Error ? error.message : error);
      }
    }
    return reply(items, cached.introduced ?? {}, cached.sources);
  }
  if (!generate) return json({ status: 'missing', items: [], sources: {} });

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey || !tmdbKey) {
    console.error('[series-trivia] MISTRAL_API_KEY ou TMDB_API_KEY absente des secrets.');
    return fail(503, 'misconfigured', 'Les anecdotes ne sont pas encore configurées.');
  }

  let series: TmdbSeries;
  let titles: { fr?: string; en?: string } = {};
  try {
    [series, titles] = await Promise.all([
      getJson(`${TMDB_BASE}/tv/${tmdbId}?api_key=${tmdbKey}&language=${language === 'fr' ? 'fr-FR' : 'en-US'}`),
      wikipediaTitles(tmdbId).catch(() => ({})),
    ]);
  } catch (error) {
    console.error('[series-trivia] TMDB :', error instanceof Error ? error.message : error);
    return fail(502, 'upstream', 'Anecdotes momentanément indisponibles.');
  }

  const [frText, enText, bySeason] = await Promise.all([
    titles.fr ? wikipediaExtract('fr', titles.fr).catch(() => '') : Promise.resolve(''),
    titles.en ? wikipediaExtract('en', titles.en).catch(() => '') : Promise.resolve(''),
    castBySeason(tmdbId, regularSeasons(series), tmdbKey),
  ]);
  const quiz = await dataQuiz(tmdbId, series, bySeason, language);
  const quizFromData = quiz.length >= MIN_DATA_QUESTIONS;
  const frMaking = makingOfSections(frText, 4_000);
  const enMaking = makingOfSections(enText, 7_000);
  const introduced = introducedNames(
    Object.fromEntries(
      Object.entries(bySeason).map(([s, roles]) => [s, roles.flatMap((r) => [r.character, r.actor])])
    )
  );
  const sources = {
    ...(titles.fr && frMaking ? { fr: `https://fr.wikipedia.org/wiki/${encodeURIComponent(titles.fr)}` } : {}),
    ...(titles.en && enMaking ? { en: `https://en.wikipedia.org/wiki/${encodeURIComponent(titles.en)}` } : {}),
  };

  const store = (items: TriviaItem[], origin: 'data' | 'ai') =>
    admin.from('series_trivia').upsert({
      tmdb_id: tmdbId,
      language,
      items,
      introduced,
      sources,
      quiz_origin: origin,
      created_at: new Date().toISOString(),
    });

  // Rien à faire écrire : pas de Wikipédia exploitable. Le quiz des bases, s'il existe, suffit.
  if (!frMaking && !enMaking) {
    const items = quizFromData ? quiz : [];
    await store(items, quizFromData ? 'data' : 'ai');
    return reply(items, introduced, sources);
  }

  // Une génération coûte un appel Mistral : elle entre dans le quota du jour,
  // comme une question à l'assistant. Une lecture en cache, non.
  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
  const { data: quota, error: quotaError } = await admin.rpc('consume_ai_quota', {
    p_user: user.id,
    p_limit: limit,
  });
  const quotaRow = Array.isArray(quota) ? quota[0] : quota;
  if (quotaError || !quotaRow) return fail(503, 'upstream', 'Anecdotes momentanément indisponibles.');
  if (quotaRow.allowed === false) return fail(429, 'quota', 'Plus d’anecdotes aujourd’hui. Ça repart demain.');
  const refund = async () => {
    const { error } = await admin.rpc('refund_ai_quota', { p_user: user.id });
    if (error) console.error('[series-trivia] refund_ai_quota :', error.message);
  };

  const context = [
    frMaking ? `=== WIKIPÉDIA (FR) ===\n${frMaking}` : '',
    enMaking ? `=== WIKIPEDIA (EN) ===\n${enMaking}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let items: TriviaItem[];
  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model: resolveModel(),
        messages: [
          { role: 'system', content: persona(language, series.name ?? 'cette série', !quizFromData) },
          { role: 'user', content: context },
        ],
        temperature: 0.2,
        max_tokens: quizFromData ? 1_000 : 1_800,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      await refund();
      console.error('[series-trivia] Mistral :', upstream.status, (await upstream.text()).slice(0, 300));
      return fail(502, 'upstream', 'Anecdotes momentanément indisponibles.');
    }
    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content ?? '{}';
    const raw = JSON.parse(typeof content === 'string' ? content : '{}');
    const written = parseTrivia(raw);
    // Le quiz des bases l'emporte : le modèle n'en a pas écrit, ou on ignore ce qu'il a écrit.
    items = quizFromData ? [...written.filter((i) => i.type === 'fact'), ...quiz] : written;
    // Ce que le modèle a rendu et ce qui a passé la validation : l'écart dit s'il dérive.
    console.log(
      `[series-trivia] ${tmdbId}/${language} : ${Array.isArray(raw?.items) ? raw.items.length : 0} reçus, ${written.length} gardés, quiz ${quizFromData ? `bases (${quiz.length})` : 'IA'}`
    );
  } catch (error) {
    await refund();
    console.error('[series-trivia] génération :', error instanceof Error ? error.message : error);
    return fail(502, 'upstream', 'Anecdotes momentanément indisponibles.');
  }

  const { error: storeError } = await store(items, quizFromData ? 'data' : 'ai');
  if (storeError) console.error('[series-trivia] cache :', storeError.message);

  return reply(items, introduced, sources);
});
