/**
 * Lecture de billets de cinéma sur une capture d'écran.
 *
 * Réserver avec la carte UGC Illimité n'envoie aucun e-mail : le billet ne vit
 * que dans l'application UGC. Une capture de « Mes billets » est donc la seule
 * trace qu'on puisse nous transmettre sans tout ressaisir.
 *
 * Même partage des rôles que partout ailleurs dans l'application : le modèle
 * LIT, il ne décide rien. Ce qu'il rend — titre, cinéma, jour, heure — est
 * ensuite cherché dans le vrai programme UGC (`cinema-directory`, action
 * `match`), et c'est la personne qui valide la liste avant qu'une séance ne
 * soit créée.
 *
 * Même clé et même plafond quotidien que la fonction `ai` : une lecture compte
 * pour une question du jour.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseTickets } from './parseTickets.ts';

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

/**
 * Les modèles qui lisent l'image, dans l'ordre d'essai.
 *
 * Mesuré le 24 septembre 2026 avec la clé du projet : `mistral-small-latest`
 * (devenu `mistral-small-2603`) et `mistral-medium-latest` répondent 429 à
 * TOUTE requête portant une image, même minuscule, alors qu'ils acceptent le
 * texte. Ministral 14B et 8B lisent l'image : environ 1 500 jetons pour une
 * capture entière. Le 8B ne sert que de relais quand le 14B est saturé.
 *
 * `MISTRAL_VISION_MODEL`, s'il est posé, passe devant. On n'emprunte pas
 * `MISTRAL_MODEL`, qui règle la fonction `ai` et désigne un modèle aveugle ici.
 */
const VISION_MODELS = ['ministral-14b-latest', 'ministral-8b-latest'];
const DEFAULT_DAILY_LIMIT = 40;
/** Lire trois captures prend plus de temps qu'une question ; l'utilisateur attend quand même. */
const UPSTREAM_TIMEOUT_MS = 50_000;

const MAX_IMAGES = 4;
/** Une capture réduite à 1 600 px pèse 150 à 400 Ko en JPEG. Au-delà, le client n'a pas fait sa part. */
const MAX_IMAGE_CHARS = 2_000_000;
const MAX_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_CHARS + 10_000;
const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Même contrat d'erreur que la fonction `ai` : un code pour l'application, une phrase pour la personne. */
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

/** Le jour parisien : c'est lui qui donne son sens à « demain » ou à « jeu. 25 sept. ». */
const parisToday = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    label: `${parts.weekday} ${parts.day}/${parts.month}/${parts.year}`,
  };
};

/**
 * La consigne de lecture.
 *
 * Deux pièges orientent sa rédaction. Un écran de billets montre aussi des
 * films qui ne sont PAS réservés — affiche du moment, recommandations — et une
 * séance y porte souvent deux heures, le début et la fin. D'où les deux règles
 * les plus appuyées : seulement ce qui est réservé, seulement l'heure de début.
 *
 * Les captures réelles de l'app UGC (octobre 2026) en ont ajouté trois : le
 * jour écrit « Ce soir » le jour même, l'affiche d'une ressortie qui porte sa
 * propre date (« À partir du 7 octobre ») et un titre tronqué (« HUNGER GAMES »
 * sur l'affiche, « HUNGER GAMES : L'EMBRASEMENT » dessous), et le siège (« E16 »)
 * imprimé près de la salle.
 */
const instructions = (today: { iso: string; label: string }) => `Tu lis des captures d'écran de billets de cinéma : l'application ou le site UGC, un e-billet, un e-mail de confirmation, un billet papier photographié. Tu relèves chaque séance RÉSERVÉE qui y figure, et rien d'autre.

Nous sommes le ${today.label} (${today.iso}), à Paris.

Réponds uniquement par un objet JSON de cette forme :
{"tickets":[{"title":"…","cinema":"…","date":"AAAA-MM-JJ","time":"HH:MM","version":"…","room":"…","seats":1}]}

RÈGLES
- Une entrée par séance réservée. Ignore les films simplement à l'affiche, mis en avant ou recommandés, les publicités, et les horaires seulement proposés à la réservation.
- title : le titre du film tel qu'il est écrit en toutes lettres, SOUS ou à côté de l'affiche, en entier (sous-titre compris). Jamais le titre stylisé imprimé sur l'affiche, souvent tronqué.
- cinema : le nom du cinéma tel qu'il est écrit, par exemple « UGC Ciné Cité Les Halles ». Chaîne vide s'il n'apparaît pas.
- date : le jour de la séance. « Aujourd'hui », « ce soir », « cet après-midi » désignent aujourd'hui ; « demain » le jour suivant ; un jour écrit sans année (« samedi 17/10 ») la prochaine date correspondante à partir d'aujourd'hui.
- Tout ce qui est imprimé SUR l'affiche du film (« De retour au cinéma », « À partir du 7 octobre », « Le 12 novembre au cinéma »…) est de la publicité : ce n'est jamais le jour, l'heure ni le titre de la séance.
- time : l'heure de DÉBUT de la séance, sur 24 heures. Jamais l'heure de fin, ni celle de l'ouverture des portes.
- version : VF, VOSTF, VO… si c'est écrit, sinon chaîne vide.
- room : la salle si elle est écrite (« en salle 3 » → « 3 »), sinon chaîne vide. Un numéro de siège (« E16 », « H15 ») n'est pas une salle.
- seats : le nombre de places si c'est écrit (« 2 personnes » → 2), sinon 1.
- N'invente rien : un champ illisible reste vide. Si aucune séance réservée n'est visible, réponds {"tickets":[]}.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail(413, 'too_large', 'Captures trop lourdes : envoie-en moins à la fois.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

  // La clé anonyme est elle-même un JWT valide, et publique : il faut résoudre
  // la session pour savoir si l'appelant est quelqu'un.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return fail(401, 'unauthenticated', 'Connecte-toi pour importer tes billets.');

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) {
    console.error('[ticket-scan] MISTRAL_API_KEY absente des secrets.');
    return fail(503, 'misconfigured', "La lecture des billets n'est pas encore configurée.");
  }

  // La requête est validée avant d'être comptée : un corps malformé ne doit pas
  // consommer une question du jour.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) return fail(400, 'bad_request', 'Aucune capture reçue.');
  if (images.length > MAX_IMAGES) {
    return fail(400, 'bad_request', `${MAX_IMAGES} captures au plus à la fois.`);
  }
  const valid = images.every(
    (image) => typeof image === 'string' && image.length <= MAX_IMAGE_CHARS && IMAGE_PATTERN.test(image)
  );
  if (!valid) return fail(400, 'bad_request', 'Une des captures est illisible ou trop lourde.');

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: quota, error: quotaError } = await asService.rpc('consume_ai_quota', {
    p_user: user.id,
    p_limit: limit,
  });
  const row = Array.isArray(quota) ? quota[0] : quota;

  // Fermé par défaut, comme la fonction `ai` : compteur en panne, on refuse.
  if (quotaError || !row) {
    console.error('[ticket-scan] consume_ai_quota :', quotaError?.message ?? 'aucune ligne renvoyée');
    return fail(503, 'upstream', 'La lecture des billets est momentanément indisponible.');
  }
  if (row.allowed === false) {
    return fail(429, 'quota', `Tu as utilisé tes ${row.quota} appels IA du jour. Ça repart demain.`);
  }

  const today = parisToday();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
  const override = Deno.env.get('MISTRAL_VISION_MODEL');
  const models = override ? [override, ...VISION_MODELS.filter((model) => model !== override)] : VISION_MODELS;

  const ask = (model: string) =>
    fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: instructions(today) },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  images.length > 1
                    ? `Relève les séances réservées visibles sur ces ${images.length} captures.`
                    : 'Relève les séances réservées visibles sur cette capture.',
              },
              ...(images as string[]).map((image) => ({ type: 'image_url', image_url: image })),
            ],
          },
        ],
        temperature: 0,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
      signal: abort.signal,
    });

  try {
    // Un modèle saturé (429) ou en panne (5xx) passe la main au suivant ; une
    // autre erreur — clé refusée, requête rejetée — se reproduirait à l'identique.
    let upstream = await ask(models[0]);
    for (const model of models.slice(1)) {
      if (upstream.ok || (upstream.status !== 429 && upstream.status < 500)) break;
      console.warn(`[ticket-scan] ${upstream.status} sur le modèle précédent, essai de ${model}`);
      await upstream.body?.cancel();
      upstream = await ask(model);
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`[ticket-scan] Mistral ${upstream.status} : ${detail.slice(0, 400)}`);
      if (upstream.status === 401 || upstream.status === 403) {
        return fail(503, 'misconfigured', 'La clé de lecture a été refusée.');
      }
      if (upstream.status === 429) {
        return fail(429, 'quota', 'Le service de lecture est saturé, réessaie dans un instant.');
      }
      return fail(502, 'upstream', "La lecture des billets n'a pas abouti.");
    }

    const payload = await upstream.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? '';
    const tickets = parseTickets(text, today.iso);
    return json({ tickets, today: today.iso, model: payload?.model ?? null, usage: payload?.usage ?? null });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    console.error('[ticket-scan] Appel Mistral échoué :', aborted ? 'délai dépassé' : String(error));
    return aborted
      ? fail(504, 'timeout', 'La lecture prend trop de temps. Réessaie avec une seule capture.')
      : fail(502, 'upstream', 'Le service de lecture est injoignable.');
  } finally {
    clearTimeout(timer);
  }
});
