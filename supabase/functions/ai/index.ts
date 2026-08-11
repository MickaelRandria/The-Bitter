/**
 * Relais vers Mistral.
 *
 * Toute clé placée dans l'application finit en clair dans le fichier JavaScript
 * que le navigateur télécharge : Vite la remplace par sa valeur au moment du
 * build, et il n'existe aucun moyen de l'y cacher. Pour une clé facturée à
 * l'usage, cela revient à publier un moyen de paiement. Elle vit donc ici, dans
 * les secrets de la fonction, et l'application n'appelle plus Mistral mais nous.
 *
 * Ce détour paie trois fois : la clé reste secrète, l'appel exige une vraie
 * session (un inconnu ne peut pas se servir), et un plafond quotidien par
 * personne borne la facture même si un compte légitime part en boucle.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

/** Alias de version : Mistral fait pointer `-latest` sur la révision courante. */
const DEFAULT_MODEL = 'mistral-small-latest';

/** Au-delà, l'appel est refusé pour la journée (UTC). */
const DEFAULT_DAILY_LIMIT = 40;

/** Mistral n'est pas toujours rapide ; l'utilisateur, lui, n'attendra pas plus. */
const UPSTREAM_TIMEOUT_MS = 45_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Bornes de taille. Le corps de la requête vient du navigateur, donc de
 * n'importe qui possédant un compte : sans plafond, un seul appel pourrait
 * envoyer un mégaoctet de contexte et coûter le prix de cent.
 */
const LIMITS = {
  question: 2_000,
  context: 12_000,
  historyTurns: 10,
  historyChars: 4_000,
};

type Action = 'assistant' | 'search' | 'review-starters' | 'review-continue';
type Role = 'user' | 'assistant';
interface Turn {
  role: Role;
  content: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Une erreur que le client saura traduire.
 *
 * Le `code` existe pour que l'application choisisse son message sans avoir à
 * reconnaître une phrase : « plus de crédit aujourd'hui » et « le service est
 * tombé » n'appellent pas la même réaction de la part de celui qui lit.
 */
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const clamp = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Le contexte du profil est bâti côté application ; on ne fait que le cadrer. */
const persona = (firstName: string, context: string) => `Tu es le Ciné-Assistant de « The Bitter », expert cinéma passionné et légèrement piquant.

STYLE DE RÉPONSE :
- Parle NATURELLEMENT comme un vrai conseiller ciné
- Tutoie l'utilisateur
- Utilise **Titre du Film** pour mettre en gras les films importants
- Utilise des émojis si ça fait sens (🎬 🔥 etc.)
- Reste conversationnel et fluide

TES REPÈRES :
- Base tes recommandations sur le PROFIL et l'HISTORIQUE de ${firstName}
- Les catalogues de streaming et les films similaires fournis ci-dessous viennent
  d'être relevés : ce sont des faits, appuie-toi dessus plutôt que sur ta mémoire
- Si tu recommandes, EXPLIQUE pourquoi ça correspond à son profil

RÈGLES :
- Maximum 150 mots par réponse
- Sois précis : cite des titres réels, pas des généralités
- Si tu ne sais pas, dis-le honnêtement. N'invente jamais une date, une
  disponibilité ou un casting : mieux vaut l'admettre que se tromper avec aplomb

${context}`;

const searchPersona = (context: string) => `Tu es un expert cinéma. Réponds naturellement, en français, en 200 mots maximum.
Utilise **titre** pour mettre en gras les films importants.

Les fiches ci-dessous viennent d'être relevées dans la base TMDB : elles font foi
sur les titres, les années et les résumés. Si la question porte sur un point
qu'elles ne couvrent pas et dont tu n'es pas certain, dis-le franchement plutôt
que de l'inventer.

${context}`;

/**
 * Amorces d'avis.
 *
 * La difficulté est de tenir deux exigences qui semblent s'opposer. Une amorce
 * doit donner envie d'écrire — donc porter de l'élan — sans décider à la place
 * de son auteur.
 *
 * Une première version interdisait tout jugement. Le modèle a obéi en rendant
 * des cases grammaticales vides : « L'histoire m'a », « Visuellement, c'est ».
 * Neutres, et parfaitement inertes : rien là-dedans ne donne envie de finir la
 * phrase.
 *
 * Ce qui débloque le problème, c'est que la note contient déjà un verdict, et
 * que ce verdict est celui de l'auteur. Un 9 sur l'image dit qu'il a été bluffé ;
 * le lui rappeler ne lui met rien dans la bouche. Ce qui doit lui rester, c'est
 * la RAISON. D'où la règle : l'amorce porte l'intensité que la note a posée,
 * jamais son motif.
 *
 * Et l'élan tient à un détail de forme : une amorce qui s'arrête sur « quand »
 * ou « au moment où » tire beaucoup plus fort qu'une qui s'arrête sur un verbe.
 * Le mot suspendu réclame une suite précise, et c'est cette précision qui fait
 * qu'on se met à écrire.
 */
const startersPersona = (context: string) => `Tu aides quelqu'un à commencer l'avis qu'il va écrire sur un film qu'il vient de noter.

Tu produis TROIS amorces de phrase en français, de 4 à 7 mots chacune.

RÈGLE 1 — Tu portes son ÉLAN, jamais sa RAISON.
Ses notes disent déjà s'il a aimé ou non : ce verdict est le sien, tu peux t'y
appuyer. Ce que tu ne peux JAMAIS faire, c'est dire POURQUOI.
- « J'ai décroché au moment où » → correct, le moment lui appartient
- « J'ai décroché à cause du rythme » → interdit, tu as trouvé la raison à sa place
- « Ce qui m'a scotché, c'est » → correct
- « Ce qui m'a scotché, c'est la photo » → interdit

RÈGLE 2 — Chaque amorce commence par une ACTION ou une SENSATION, à la première
personne et au passé. Jamais une case vide comme « L'histoire m'a » ou
« Visuellement, c'est » : ça n'engage à rien, donc personne ne le complète.

RÈGLE 3 — Chaque amorce se termine sur un mot qui RÉCLAME une suite précise :
« quand », « au moment où », « c'est », « parce que », « sauf », « jusqu'à ».
Un mot suspendu tire plus fort qu'un verbe suspendu.

ACCORDE LE TON À SES NOTES :
- Critère noté 8 à 10 → verbe d'enthousiasme
  « J'en ai pris plein les yeux quand » · « Je n'ai pas lâché à partir de »
- Critère noté 0 à 4 → verbe de déception
  « J'ai décroché au moment où » · « Je n'ai jamais cru à »
- Critère noté 5 à 7 → verbe d'hésitation
  « J'ai hésité jusqu'à » · « Ça tenait, sauf quand »

Les trois amorces visent trois critères différents, en commençant par celui dont
la note s'écarte le plus de la moyenne : c'est là qu'il a le plus à dire.

Pas de guillemets, pas de numéro, pas de point final.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"starters": ["amorce une", "amorce deux", "amorce trois"]}

${context}`;

/**
 * Prolongement d'un avis en cours.
 *
 * Une seule phrase, et jamais la dernière : c'est ce qui garde l'auteur aux
 * commandes. Deux phrases d'un coup, et il relit au lieu d'écrire ; une phrase
 * qui conclut, et il n'a plus qu'à valider un texte qui n'est pas le sien.
 */
const continuePersona = (context: string) => `Quelqu'un est en train d'écrire son avis sur un film. Tu ajoutes UNE SEULE phrase à la suite de ce qu'il a déjà écrit.

RÈGLES ABSOLUES :
- UNE phrase. Jamais deux. Jamais un paragraphe.
- Elle prolonge SON idée dans SA direction. Tu ne changes pas de sujet, tu ne le
  contredis pas, tu ne résumes pas ce qu'il vient de dire.
- Tu reprends son niveau de langue, son rythme et son ton. S'il est sec, sois sec.
  S'il est familier, sois familier. Tu n'écris pas mieux que lui, tu écris comme lui.
- Tu ne CONCLUS JAMAIS. Ta phrase laisse la suite ouverte : c'est à lui de finir
  son avis, pas à toi.
- N'invente aucun fait sur le film : ni acteur, ni scène, ni date. Tu prolonges
  une impression, tu ne racontes pas le film.

Réponds UNIQUEMENT par la phrase, sans guillemets et sans introduction.

${context}`;

/** Réglages propres à chaque usage : longueur et liberté n'ont rien à voir. */
const TUNING: Record<Action, { temperature: number; maxTokens: number; json: boolean }> = {
  assistant: { temperature: 0.8, maxTokens: 700, json: false },
  search: { temperature: 0.4, maxTokens: 700, json: false },
  'review-starters': { temperature: 1.0, maxTokens: 200, json: true },
  'review-continue': { temperature: 0.7, maxTokens: 120, json: false },
};

const isAction = (value: unknown): value is Action =>
  value === 'assistant' ||
  value === 'search' ||
  value === 'review-starters' ||
  value === 'review-continue';

/**
 * Extrait les amorces d'une réponse qui devrait être du JSON.
 *
 * Le mode JSON de Mistral rend l'objet attendu dans l'immense majorité des cas,
 * mais une seule réponse mal formée suffirait à afficher un champ vide au moment
 * précis où l'on cherchait à éviter la page blanche. D'où le repli sur un
 * découpage ligne à ligne : mieux vaut trois amorces imparfaites que rien.
 */
const parseStarters = (raw: string): string[] => {
  const clean = (s: string) =>
    s
      .replace(/^\s*[-*\d.)\]]+\s*/, '')
      .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
      .trim();

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.starters;
    if (Array.isArray(list)) {
      const out = list.filter((s) => typeof s === 'string').map(clean).filter(Boolean);
      if (out.length) return out.slice(0, 3);
    }
  } catch {
    // Pas du JSON : on retombe sur le découpage ci-dessous.
  }

  return raw
    .split('\n')
    .map(clean)
    .filter((s) => s.length > 2 && s.length < 120)
    .slice(0, 3);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

  // La vérification du JWT par la plateforme ne suffit pas : la clé anonyme est
  // elle-même un JWT valide et elle est publique. Il faut donc résoudre la
  // session pour savoir si l'appelant est quelqu'un, et non seulement quelque chose.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return fail(401, 'unauthenticated', 'Connecte-toi pour utiliser le Ciné-Assistant.');
  }

  // L'état de la configuration n'est révélé qu'après l'authentification : un
  // inconnu n'a pas à apprendre si la clé est posée ou non, il n'obtient que
  // le même 401 dans tous les cas.
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) {
    // Volontairement explicite dans les journaux : c'est l'erreur du premier
    // déploiement, et la deviner coûte bien plus cher que de l'annoncer.
    console.error('[ai] MISTRAL_API_KEY absente des secrets de la fonction.');
    return fail(503, 'misconfigured', "L'assistant n'est pas encore configuré.");
  }

  // La requête est validée avant d'être comptée : sinon un corps malformé
  // consommerait un appel du quota sans qu'aucune question n'ait été posée.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }

  const action: Action = isAction(body.action) ? body.action : 'assistant';
  const context = clamp(body.context, LIMITS.context);
  const question = clamp(body.question ?? body.query ?? body.text, LIMITS.question).trim();
  if (!question) return fail(400, 'bad_request', 'Question vide.');

  const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: quota, error: quotaError } = await asService.rpc('consume_ai_quota', {
    p_user: user.id,
    p_limit: limit,
  });

  const row = Array.isArray(quota) ? quota[0] : quota;

  // Fermé par défaut : compteur en panne ou réponse vide, on refuse. Laisser
  // passer serait revenir précisément à la clé sans plafond qu'on voulait fuir.
  if (quotaError || !row) {
    console.error('[ai] consume_ai_quota :', quotaError?.message ?? 'aucune ligne renvoyée');
    return fail(503, 'upstream', "L'assistant est momentanément indisponible.");
  }

  if (row.allowed === false) {
    return fail(
      429,
      'quota',
      `Tu as atteint tes ${row.quota} questions du jour. Ça repart demain.`
    );
  }

  const messages: { role: 'system' | Role; content: string }[] = [];

  if (action === 'search') {
    messages.push({ role: 'system', content: searchPersona(context) });
  } else if (action === 'review-starters') {
    messages.push({ role: 'system', content: startersPersona(context) });
  } else if (action === 'review-continue') {
    messages.push({ role: 'system', content: continuePersona(context) });
  } else {
    const firstName = clamp(body.firstName, 60) || 'toi';
    messages.push({ role: 'system', content: persona(firstName, context) });

    // On ne garde que la fin de la conversation : le début n'influence presque
    // plus la réponse mais se paie à chaque tour.
    const history = Array.isArray(body.history) ? (body.history as Turn[]) : [];
    for (const turn of history.slice(-LIMITS.historyTurns)) {
      const role: Role = turn?.role === 'assistant' ? 'assistant' : 'user';
      const content = clamp(turn?.content, LIMITS.historyChars);
      if (content) messages.push({ role, content });
    }
  }

  messages.push({ role: 'user', content: question });

  const tuning = TUNING[action];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('MISTRAL_MODEL') ?? DEFAULT_MODEL,
        messages,
        temperature: tuning.temperature,
        max_tokens: tuning.maxTokens,
        ...(tuning.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: abort.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`[ai] Mistral ${upstream.status} : ${detail.slice(0, 400)}`);

      // 401 côté Mistral veut dire que la clé est mauvaise ou révoquée. C'est un
      // problème de configuration, pas une panne : le distinguer évite de
      // chercher une panne réseau pendant une heure.
      if (upstream.status === 401 || upstream.status === 403) {
        return fail(503, 'misconfigured', "La clé de l'assistant a été refusée.");
      }
      if (upstream.status === 429) {
        return fail(429, 'quota', "L'assistant est saturé, réessaie dans un instant.");
      }
      return fail(502, 'upstream', "L'assistant n'a pas répondu.");
    }

    const payload = await upstream.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) return fail(502, 'upstream', "L'assistant n'a rien répondu.");

    if (action === 'review-starters') {
      const starters = parseStarters(text);
      if (starters.length === 0) return fail(502, 'upstream', "Aucune amorce n'a pu être lue.");
      return json({ starters, usage: payload?.usage ?? null });
    }

    if (action === 'review-continue') {
      // Une phrase, et une seule : le modèle en donne parfois deux malgré la
      // consigne, et c'est justement ce qui ferait basculer l'auteur du rôle de
      // rédacteur à celui de relecteur. On coupe plutôt que d'espérer.
      const first = text.trim().replace(/^["'«»\s]+/, '');
      const cut = first.search(/[.!?…](\s|$)/);
      const single = cut === -1 ? first : first.slice(0, cut + 1);
      return json({ text: single.trim(), usage: payload?.usage ?? null });
    }

    return json({ text, usage: payload?.usage ?? null });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    console.error('[ai] Appel Mistral échoué :', aborted ? 'délai dépassé' : String(error));
    return aborted
      ? fail(504, 'timeout', "L'assistant met trop de temps à répondre.")
      : fail(502, 'upstream', "L'assistant est injoignable.");
  } finally {
    clearTimeout(timer);
  }
});
