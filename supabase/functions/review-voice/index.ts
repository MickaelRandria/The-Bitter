/**
 * Dictée d'un avis : un vocal en entrée, un texte prêt à relire en sortie.
 *
 * Sur 90 films notés, un seul portait un avis écrit (voir `ReviewComposer`).
 * Parler deux phrases en sortant de la salle coûte bien moins que les taper.
 *
 * Deux passages, chacun dans son rôle :
 * 1. Voxtral TRANSCRIT, avec le titre, le réalisateur et les acteurs comme
 *    vocabulaire imposé : ce sont les mots qu'un modèle généraliste écorche.
 * 2. Ministral MET AU PROPRE : hésitations, faux départs, ponctuation. Il ne
 *    touche ni au fond ni au ton, et `acceptPolish` le vérifie à la louche :
 *    s'il ajoute des mots ou en retire trop, on garde la dictée.
 *
 * L'audio n'est ni stocké ni journalisé : il traverse la fonction et repart.
 * Une dictée compte pour une question du jour, comme une lecture de billets.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acceptPolish, biasTerms, tidyTranscript, unwrapPolish } from './polish.ts';

const TRANSCRIBE_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
const CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const TRANSCRIBE_MODEL = 'voxtral-mini-latest';
/** Les mêmes que `ai` et `ticket-scan` : `mistral-small-latest` est hors forfait. */
const POLISH_MODELS = ['ministral-14b-latest', 'ministral-8b-latest'];
const DEFAULT_DAILY_LIMIT = 40;

/** Deux minutes d'Opus à 32 kbit/s pèsent 500 Ko ; en AAC, un peu plus du double. */
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 40_000;
const POLISH_TIMEOUT_MS = 15_000;

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

const polishInstructions = (lang: 'fr' | 'en', terms: string[]) =>
  lang === 'en'
    ? `You clean up a film review that someone dictated out loud. Their words, their opinion, their tone: you only tidy.

- Remove hesitations (uh, um, like used as a filler), false starts and repeated words.
- Add punctuation, capitals and paragraph-free sentences.
- Fix the spelling of names using this list when one was clearly meant: ${terms.join(', ') || '(none)'}.
- Keep their vocabulary, slang, swearing and order of ideas. Never add an idea, an adjective or a conclusion, never summarise, never make it more elegant.
- Reply with the cleaned text only, nothing before or after.`
    : `Tu mets au propre un avis de film dicté à voix haute. Ses mots, son avis, son ton : tu ne fais que ranger.

- Retire les hésitations (euh, bah, ben, genre employé comme tic), les faux départs et les mots répétés.
- Ajoute la ponctuation, les majuscules, corrige l'orthographe et les accords.
- Corrige l'orthographe des noms d'après cette liste quand l'un d'eux était visiblement visé : ${terms.join(', ') || '(aucun)'}.
- Garde son vocabulaire, son argot, ses gros mots, son tutoiement et l'ordre de ses idées. N'ajoute jamais une idée, un adjectif ni une conclusion, ne résume pas, n'embellis pas.
- Réponds uniquement par le texte nettoyé, rien avant ni après.`;

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
  if (!apiKey) {
    console.error('[review-voice] MISTRAL_API_KEY absente des secrets.');
    return fail(503, 'misconfigured', "La dictée n'est pas encore configurée.");
  }

  // Validée avant d'être comptée : un envoi raté ne consomme pas de question.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'bad_request', 'Vocal illisible.');
  }
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0)
    return fail(400, 'bad_request', 'Aucun vocal reçu.');
  if (audio.size > MAX_AUDIO_BYTES)
    return fail(413, 'too_large', 'Vocal trop long : deux minutes au plus.');
  const baseType = (audio.type || '').split(';')[0].trim().toLowerCase();
  const extension = AUDIO_TYPES[baseType];
  if (!extension) return fail(415, 'bad_request', "Ce format audio n'est pas pris en charge.");

  const lang: 'fr' | 'en' = form.get('lang') === 'en' ? 'en' : 'fr';
  let terms: string[] = [];
  try {
    terms = biasTerms(JSON.parse(String(form.get('terms') ?? '[]')));
  } catch {
    terms = [];
  }

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

  // 1. Transcription.
  let raw = '';
  let seconds: number | null = null;
  {
    const transcribe = (withBias: boolean, signal: AbortSignal) => {
      const upstreamForm = new FormData();
      upstreamForm.append('model', TRANSCRIBE_MODEL);
      upstreamForm.append('file', audio, `avis.${extension}`);
      upstreamForm.append('language', lang);
      upstreamForm.append('temperature', '0');
      if (withBias) for (const term of terms) upstreamForm.append('context_bias', term);
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
      let upstream = await transcribe(terms.length > 0, abort.signal);
      // Le vocabulaire est un bonus : s'il fait rejeter la requête, on
      // transcrit sans lui plutôt que de perdre la dictée.
      if ((upstream.status === 400 || upstream.status === 422) && terms.length > 0) {
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

  if (!raw) return json({ text: '', raw: '', polished: false, seconds });

  // 2. Mise au propre. Elle peut échouer sans rien casser : on rend la dictée.
  const tidy = tidyTranscript(raw, lang);
  let text = tidy;
  let polished = false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), POLISH_TIMEOUT_MS);
  try {
    for (const model of POLISH_MODELS) {
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
            { role: 'system', content: polishInstructions(lang, terms) },
            { role: 'user', content: raw },
          ],
          temperature: 0,
          max_tokens: 900,
        }),
        signal: abort.signal,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        console.warn(`[review-voice] mise au propre ${upstream.status} sur ${model}`);
        if (upstream.status === 429 || upstream.status >= 500) continue;
        break;
      }
      const payload = await upstream.json();
      const candidate = unwrapPolish(String(payload?.choices?.[0]?.message?.content ?? ''));
      if (acceptPolish(raw, candidate, terms)) {
        text = candidate;
        polished = true;
      } else {
        console.warn('[review-voice] mise au propre refusée par le garde-fou');
      }
      break;
    }
  } catch (error) {
    console.warn('[review-voice] mise au propre abandonnée :', String(error));
  } finally {
    clearTimeout(timer);
  }

  return json({ text, raw, polished, seconds });
});
