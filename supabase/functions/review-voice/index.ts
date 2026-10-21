/**
 * L'avis à la voix : dictée, avis guidé, resserrage.
 *
 * Sur 90 films notés, un seul portait un avis écrit (voir `ReviewComposer`).
 * Parler deux phrases en sortant de la salle coûte bien moins que les taper.
 *
 * Trois actions, une seule règle : le modèle n'ajoute aucun avis à la place.
 * - Dictée (multipart `audio`) : Voxtral TRANSCRIT, avec le titre, le
 *   réalisateur et les acteurs comme vocabulaire imposé ; Ministral MET AU
 *   PROPRE (hésitations, faux départs, ponctuation).
 * - `assemble` (JSON) : Ministral RÉDIGE un seul avis fluide à partir des
 *   réponses de l'avis guidé et de leurs questions, sans idée ajoutée.
 * - `tighten` (JSON) : le même avis, coupé d'environ moitié.
 * Chaque sortie passe un garde-fou de `polish.ts` ; refusée, on rend l'entrée.
 *
 * Un avis compte pour UNE question du jour : le premier appel consomme le
 * quota et rend un jeton (`token.ts`) que les suivants présentent.
 *
 * L'audio n'est ni stocké ni journalisé : il traverse la fonction et repart.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  acceptPolish,
  acceptRewrite,
  acceptTighten,
  biasTerms,
  biasWords,
  joinAnswers,
  tidyTranscript,
  unwrapPolish,
} from './polish.ts';
import { mintToken, verifyToken } from './token.ts';

const TRANSCRIBE_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const TRANSCRIBE_MODEL = 'voxtral-mini-latest';
/** Les mêmes que `ai` et `ticket-scan` : `mistral-small-latest` est hors forfait. */
const CHAT_MODELS = ['ministral-14b-latest', 'ministral-8b-latest'];
const DEFAULT_DAILY_LIMIT = 40;

/** Deux minutes d'Opus à 32 kbit/s pèsent 500 Ko ; en AAC, un peu plus du double. */
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 4_000;
const MAX_ANSWERS = 3;
const TRANSCRIBE_TIMEOUT_MS = 40_000;
const CHAT_TIMEOUT_MS = 15_000;

const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

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

/** Même contrat d'erreur que `ai` : un code pour l'application, une phrase pour la personne. */
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

type Lang = 'fr' | 'en';

const namesLine = (terms: string[], lang: Lang) =>
  terms.join(', ') || (lang === 'en' ? '(none)' : '(aucun)');

const polishInstructions = (lang: Lang, terms: string[]) =>
  lang === 'en'
    ? `You clean up a film review that someone dictated out loud. Their words, their opinion, their tone: you only tidy.

- Remove hesitations (uh, um, like used as a filler), false starts and repeated words.
- Add punctuation and capitals, fix spelling and agreement.
- Fix the spelling of names using this list when one was clearly meant: ${namesLine(terms, lang)}.
- Keep their vocabulary, slang, swearing and order of ideas. Never add an idea, an adjective or a conclusion, never summarise, never make it more elegant.
- Reply with the cleaned text only, nothing before or after.`
    : `Tu mets au propre un avis de film dicté à voix haute. Ses mots, son avis, son ton : tu ne fais que ranger.

- Retire les hésitations (euh, bah, ben, genre employé comme tic), les faux départs et les mots répétés.
- Ajoute la ponctuation, les majuscules, corrige l'orthographe et les accords.
- Corrige l'orthographe des noms d'après cette liste quand l'un d'eux était visiblement visé : ${namesLine(terms, lang)}.
- Garde son vocabulaire, son argot, ses gros mots, son tutoiement et l'ordre de ses idées. N'ajoute jamais une idée, un adjectif ni une conclusion, ne résume pas, n'embellis pas.
- Réponds uniquement par le texte nettoyé, rien avant ni après.`;

/**
 * Les réponses de l'avis guidé sont elliptiques : « le rythme », « oui, la
 * fin », « aux fans de SF ». Mises bout à bout, elles ne veulent rien dire sans
 * leur question. Le modèle RÉDIGE donc ici, à partir d'elles seules ; c'est la
 * seule action où il reformule, et `acceptRewrite` borne ce qu'il ajoute.
 */
const assembleInstructions = (lang: Lang, terms: string[]) =>
  lang === 'en'
    ? `You write film reviews on behalf of someone who just watched a film. They answered a few questions out loud; their answers are often fragments ("the pacing", "yes, the ending") that only make sense next to the question. Write THEIR review, in the first person, as a text they could have written in one go and that reads clearly without the questions.

- Rephrase freely so it flows: full sentences, an explicit subject (bring in what the question was about when the answer implies it), natural transitions between ideas, the verdict last.
- Their opinion and nothing else: every judgement, nuance and degree comes from their answers. Never invent an idea, a scene, praise, criticism or a fact about the film.
- Keep their voice: casual stays casual, keep their strong expressions, humour and swearing. Do not sound like a press critic, no stock phrases ("masterpiece", "a must-see").
- Never quote the questions.
- Stay close to the length of their answers, no padding. Over 60 words, 2 paragraphs separated by a blank line. No title, no list, no quotation marks around the text.
- Names, spelled from this list: ${namesLine(terms, lang)}.
- Reply with the review only.`
    : `Tu rédiges l'avis d'une personne qui vient de voir un film. Elle a répondu à voix haute à quelques questions ; ses réponses sont souvent des fragments (« le rythme », « oui, la fin ») qui n'ont de sens qu'à côté de la question. Écris SON avis, à la première personne, comme un texte qu'elle aurait écrit d'une traite et qu'on comprend sans les questions.

- Reformule librement pour que ce soit fluide : phrases complètes, sujet explicite (reprends ce dont parle la question quand la réponse le sous-entend), transitions naturelles entre les idées, verdict à la fin.
- Son avis, rien que son avis : chaque jugement, chaque nuance et son intensité viennent de ses réponses. N'invente ni idée, ni scène, ni compliment, ni critique, ni information sur le film.
- Garde sa voix : le familier reste familier, garde ses expressions fortes, son humour, ses gros mots. N'écris pas comme un critique de presse, pas de formules toutes faites (« chef-d'œuvre », « à ne pas manquer »).
- Ne cite jamais les questions.
- Reste proche de la longueur de ses réponses, sans remplissage. Au-delà de 60 mots, 2 paragraphes séparés par une ligne vide. Pas de titre, pas de liste, pas de guillemets autour du texte.
- Les noms, écrits d'après cette liste : ${namesLine(terms, lang)}.
- Réponds uniquement par l'avis.`;

const tightenInstructions = (lang: Lang) =>
  lang === 'en'
    ? `Tighten this film review to its strongest sentences, about half as long.

- CUT only: repetition, secondary details. Keep the verdict.
- Do not rephrase and add nothing, except a linking word if two kept sentences need one.
- Keep paragraphs only if the result is still over 60 words.
- Reply with the tightened review only.`
    : `Resserre cet avis de film sur ses phrases les plus fortes, environ moitié moins long.

- Tu COUPES seulement : redites, détails secondaires. Garde le verdict.
- Ne reformule pas et n'ajoute rien, sauf un mot de liaison si deux phrases gardées en ont besoin.
- Garde des paragraphes seulement si le résultat dépasse encore 60 mots.
- Réponds uniquement par l'avis resserré.`;

/** Un appel texte à Ministral, avec relais sur le 8B quand le 14B est saturé. */
async function chat(
  apiKey: string,
  system: string,
  user: string,
  temperature = 0
): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CHAT_TIMEOUT_MS);
  try {
    for (const model of CHAT_MODELS) {
      const upstream = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: 900,
        }),
        signal: abort.signal,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        console.warn(`[review-voice] ${model} ${upstream.status}`);
        if (upstream.status === 429 || upstream.status >= 500) continue;
        return null;
      }
      const payload = await upstream.json();
      return unwrapPolish(String(payload?.choices?.[0]?.message?.content ?? ''));
    }
    return null;
  } catch (error) {
    console.warn('[review-voice] appel texte abandonné :', String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES + 20_000) {
    return fail(413, 'too_large', 'Vocal trop long : deux minutes au plus.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

  // La clé anonyme est elle-même un JWT valide, et publique : il faut résoudre
  // la session pour savoir si l'appelant est quelqu'un.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return fail(401, 'unauthenticated', 'Connecte-toi pour dicter ton avis.');

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey || !serviceKey) {
    console.error('[review-voice] MISTRAL_API_KEY ou clé de service absente des secrets.');
    return fail(503, 'misconfigured', "La dictée n'est pas encore configurée.");
  }

  // ── Lecture et validation de la demande, avant tout décompte ─────────────
  const isAudio = (req.headers.get('content-type') ?? '').startsWith('multipart/form-data');
  let lang: Lang = 'fr';
  let terms: string[] = [];
  let token: unknown = null;
  let audio: File | null = null;
  let extension = '';
  let action: 'assemble' | 'tighten' | null = null;
  let answers: { question: string; text: string }[] = [];
  let fullText = '';

  if (isAudio) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail(400, 'bad_request', 'Vocal illisible.');
    }
    const file = form.get('audio');
    if (!(file instanceof File) || file.size === 0)
      return fail(400, 'bad_request', 'Aucun vocal reçu.');
    if (file.size > MAX_AUDIO_BYTES)
      return fail(413, 'too_large', 'Vocal trop long : deux minutes au plus.');
    extension = AUDIO_TYPES[(file.type || '').split(';')[0].trim().toLowerCase()] ?? '';
    if (!extension) return fail(415, 'bad_request', "Ce format audio n'est pas pris en charge.");
    audio = file;
    lang = form.get('lang') === 'en' ? 'en' : 'fr';
    token = form.get('token');
    try {
      terms = biasTerms(JSON.parse(String(form.get('terms') ?? '[]')));
    } catch {
      terms = [];
    }
  } else {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail(400, 'bad_request', 'Requête illisible.');
    }
    lang = body.lang === 'en' ? 'en' : 'fr';
    token = body.token;
    terms = biasTerms(body.terms);
    if (body.action === 'assemble') {
      action = 'assemble';
      const list = Array.isArray(body.answers) ? body.answers.slice(0, MAX_ANSWERS) : [];
      answers = list
        .map((item: any) => ({
          question: String(item?.question ?? '').slice(0, 300),
          text: String(item?.text ?? '')
            .trim()
            .slice(0, MAX_TEXT_CHARS),
        }))
        .filter((item) => item.text);
      if (answers.length === 0) return fail(400, 'bad_request', 'Aucune réponse à assembler.');
    } else if (body.action === 'tighten') {
      action = 'tighten';
      fullText = String(body.text ?? '')
        .trim()
        .slice(0, MAX_TEXT_CHARS);
      if (!fullText) return fail(400, 'bad_request', 'Aucun avis à resserrer.');
    } else {
      return fail(400, 'bad_request', 'Action inconnue.');
    }
  }

  // Même une seule réponse passe par la rédaction : « aux fans de SF, pas à ma
  // mère » ne se comprend pas sans sa question.

  // ── Une question du jour par avis ────────────────────────────────────────
  let nextToken = typeof token === 'string' ? token : '';
  if (!(await verifyToken(serviceKey, user.id, token))) {
    const limit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);
    const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: quota, error: quotaError } = await asService.rpc('consume_ai_quota', {
      p_user: user.id,
      p_limit: limit,
    });
    const row = Array.isArray(quota) ? quota[0] : quota;
    // Fermé par défaut, comme `ai` : compteur en panne, on refuse.
    if (quotaError || !row) {
      console.error(
        '[review-voice] consume_ai_quota :',
        quotaError?.message ?? 'aucune ligne renvoyée'
      );
      return fail(503, 'upstream', 'La dictée est momentanément indisponible.');
    }
    if (row.allowed === false) {
      return fail(
        429,
        'quota',
        `Tu as utilisé tes ${row.quota} appels IA du jour. Ça repart demain.`
      );
    }
    nextToken = await mintToken(serviceKey, user.id);
  }

  // ── Mise en forme de l'avis guidé ────────────────────────────────────────
  if (action === 'assemble') {
    const joined = joinAnswers(answers.map((answer) => answer.text), lang);
    const prompt = answers
      .map((answer, i) =>
        lang === 'en'
          ? `Question ${i + 1}: ${answer.question}\nTheir answer: ${answer.text}`
          : `Question ${i + 1} : ${answer.question}\nSa réponse : ${answer.text}`
      )
      .join('\n\n');
    // Un peu de latitude pour la tournure ; refusée, une seconde fois au plus juste.
    let text: string | null = null;
    for (const temperature of [0.3, 0]) {
      const candidate = await chat(apiKey, assembleInstructions(lang, terms), prompt, temperature);
      if (!candidate) break;
      if (acceptRewrite(answers, candidate, terms)) {
        text = candidate;
        break;
      }
      console.warn(`[review-voice] rédaction refusée par le garde-fou (t=${temperature})`);
    }
    return json({ text: text ?? joined, polished: !!text, token: nextToken });
  }

  // ── Resserrage ───────────────────────────────────────────────────────────
  if (action === 'tighten') {
    const candidate = await chat(apiKey, tightenInstructions(lang), fullText);
    const ok = !!candidate && acceptTighten(fullText, candidate, terms);
    if (candidate && !ok) console.warn('[review-voice] resserrage refusé par le garde-fou');
    if (!ok) return fail(502, 'upstream', "L'avis n'a pas pu être resserré. Réessaie.");
    return json({ text: candidate, token: nextToken });
  }

  // ── Dictée : 1. transcription ────────────────────────────────────────────
  let raw = '';
  let seconds: number | null = null;
  {
    const words = biasWords(terms);
    const transcribe = (withBias: boolean, signal: AbortSignal) => {
      const upstreamForm = new FormData();
      upstreamForm.append('model', TRANSCRIBE_MODEL);
      upstreamForm.append('file', audio!, `avis.${extension}`);
      upstreamForm.append('language', lang);
      upstreamForm.append('temperature', '0');
      // Une seule valeur, mots séparés par des virgules : c'est la lecture de l'API.
      if (withBias && words.length) upstreamForm.append('context_bias', words.join(','));
      return fetch(TRANSCRIBE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: upstreamForm,
        signal,
      });
    };

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TRANSCRIBE_TIMEOUT_MS);
    try {
      let upstream = await transcribe(words.length > 0, abort.signal);
      // Le vocabulaire est un bonus : s'il fait rejeter la requête, on
      // transcrit sans lui plutôt que de perdre la dictée.
      if ((upstream.status === 400 || upstream.status === 422) && words.length > 0) {
        const detail = await upstream.text().catch(() => '');
        console.warn(
          `[review-voice] Voxtral ${upstream.status} avec context_bias : ${detail.slice(0, 300)}`
        );
        upstream = await transcribe(false, abort.signal);
      }
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        console.error(`[review-voice] Voxtral ${upstream.status} : ${detail.slice(0, 400)}`);
        if (upstream.status === 401 || upstream.status === 403) {
          return fail(503, 'misconfigured', 'La clé de transcription a été refusée.');
        }
        if (upstream.status === 429) {
          return fail(429, 'busy', 'La transcription est saturée, réessaie dans un instant.');
        }
        return fail(502, 'upstream', "La transcription n'a pas abouti.");
      }
      const payload = await upstream.json();
      raw = String(payload?.text ?? '').trim();
      seconds = Number(payload?.usage?.prompt_audio_seconds) || null;
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      console.error(
        '[review-voice] Voxtral injoignable :',
        aborted ? 'délai dépassé' : String(error)
      );
      return aborted
        ? fail(504, 'timeout', 'La transcription prend trop de temps. Réessaie plus court.')
        : fail(502, 'upstream', 'Le service de transcription est injoignable.');
    } finally {
      clearTimeout(timer);
    }
  }

  if (!raw) return json({ text: '', raw: '', polished: false, seconds, token: nextToken });

  // ── Dictée : 2. mise au propre. Elle peut échouer sans rien casser. ──────
  const candidate = await chat(apiKey, polishInstructions(lang, terms), raw);
  const polished = !!candidate && acceptPolish(raw, candidate, terms);
  if (candidate && !polished)
    console.warn('[review-voice] mise au propre refusée par le garde-fou');
  const text = polished ? candidate! : tidyTranscript(raw, lang);
  return json({ text, raw, polished, seconds, token: nextToken });
});
