/**
 * Le cockpit : statistiques et contacts, réservés à l'administrateur.
 *
 * Tout se décide ici, jamais dans le navigateur : la réponse contient les
 * e-mails de tous les comptes. Deux portes seulement : le compte du propriétaire,
 * ou le mot de passe du secret `COCKPIT_PASSWORD`, qui ouvre une session de
 * 12 heures liée au compte connecté. Sans ce secret, seule la première existe.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { buildSnapshot, OWNER_EMAIL, RawMovie } from './logic.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TOKEN_TTL_MS = 12 * 3_600_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const PAGE = 1_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Compare des empreintes de même longueur : la durée ne dit rien du contenu. */
const sameDigest = async (a: string, b: string) => {
  const [left, right] = await Promise.all(
    [a, b].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < x.length; index += 1) difference |= x[index] ^ y[index];
  return difference === 0;
};

const sign = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
};

const issueToken = async (secret: string, userId: string) => {
  const expires = Date.now() + TOKEN_TTL_MS;
  return `${expires}.${await sign(secret, `${userId}.${expires}`)}`;
};

const tokenIsValid = async (secret: string, userId: string, token: unknown) => {
  if (typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!/^\d+$/.test(expires ?? '') || !signature || Number(expires) < Date.now()) return false;
  return sameDigest(signature, await sign(secret, `${userId}.${expires}`));
};

/** Vérifie le mot de passe. Le compteur vit en base : une instance neuve n'efface rien. */
async function checkPassword(admin: SupabaseClient, userId: string, password: string, expected: string) {
  const { data, error } = await admin
    .from('cockpit_unlock_attempts')
    .select('failures, locked_until')
    .eq('user_id', userId)
    .maybeSingle();
  // Fermé par défaut : sans compteur, le mot de passe pourrait être deviné sans limite.
  if (error) {
    console.error('[cockpit] compteur illisible :', error.message);
    return 'unavailable' as const;
  }
  if (data?.locked_until && Date.parse(data.locked_until) > Date.now()) return 'locked' as const;

  if (await sameDigest(password, expected)) {
    await admin.from('cockpit_unlock_attempts').delete().eq('user_id', userId);
    return 'ok' as const;
  }

  const failures = (data?.failures ?? 0) + 1;
  const locked = failures >= MAX_FAILURES;
  await admin.from('cockpit_unlock_attempts').upsert({
    user_id: userId,
    failures: locked ? 0 : failures,
    locked_until: locked ? new Date(Date.now() + LOCK_MS).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  return locked ? ('locked' as const) : ('wrong' as const);
}

/** PostgREST s'arrête à 1 000 lignes : on lit toutes les pages. */
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

async function snapshot(admin: SupabaseClient) {
  const now = new Date();
  const since = new Date(now.getTime() - 32 * 86_400_000);
  const { data: listed, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw new Error(usersError.message);

  const [profiles, movies, usage, screenings, push] = await Promise.all([
    allRows<{ id: string; first_name: string | null }>((a, b) => admin.from('profiles').select('id, first_name').order('id').range(a, b)),
    allRows<{ profile_id: string; tmdb_id: number | null; title: string; rated_at: string | null; created_at: string | null }>((a, b) =>
      admin.from('user_movies').select('profile_id, tmdb_id, title, rated_at, created_at').is('deleted_at', null).order('id').range(a, b)
    ),
    admin.from('ai_usage').select('user_id, day, calls').gte('day', since.toISOString().slice(0, 10)),
    admin.from('cinema_screenings').select('profile_id, tmdb_id, starts_at, status').gte('starts_at', since.toISOString()),
    admin.from('push_subscriptions').select('profile_id').eq('active', true),
  ]);
  for (const result of [usage, screenings, push]) if (result.error) throw new Error(result.error.message);

  const firstNames = new Map(profiles.map((profile) => [profile.id, profile.first_name]));
  return buildSnapshot(
    {
      accounts: listed.users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        firstName: firstNames.get(user.id) ?? null,
        createdAt: user.created_at,
        confirmed: !!user.email_confirmed_at,
      })),
      movies: movies.map<RawMovie>((movie) => ({
        profileId: movie.profile_id,
        tmdbId: movie.tmdb_id,
        title: movie.title,
        ratedAt: movie.rated_at,
        createdAt: movie.created_at,
      })),
      usage: (usage.data ?? []).map((row) => ({ userId: row.user_id, day: row.day, calls: row.calls })),
      screenings: (screenings.data ?? [])
        .filter((row) => row.status !== 'cancelled')
        .map((row) => ({ profileId: row.profile_id, tmdbId: row.tmdb_id, startsAt: row.starts_at })),
      pushActive: new Set((push.data ?? []).map((row) => row.profile_id)).size,
    },
    now
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'Méthode non autorisée.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (!user) return fail(401, 'auth', 'Connecte-toi pour ouvrir le cockpit.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Requête illisible.');
  }

  // Une adresse non confirmée ne prouve rien : elle n'ouvre pas la porte directe.
  const isOwner = user.email?.toLowerCase() === OWNER_EMAIL && !!user.email_confirmed_at;
  const password = Deno.env.get('COCKPIT_PASSWORD') ?? '';
  const tokenSecret = password ? `${password}.${serviceKey}` : '';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'unlock') {
    if (isOwner) return json({ ok: true });
    if (typeof body.password !== 'string' || !body.password) return fail(403, 'password_required', 'Mot de passe requis.');
    if (!password) return fail(503, 'misconfigured', "L'accès par mot de passe n'est pas configuré.");
    const result = await checkPassword(admin, user.id, body.password.slice(0, 200), password);
    if (result === 'locked') return fail(429, 'locked', 'Trop d’essais. Réessaie dans 15 minutes.');
    if (result === 'unavailable') return fail(503, 'upstream', 'Accès momentanément indisponible.');
    if (result === 'wrong') return fail(403, 'wrong_password', 'Mot de passe incorrect.');
    return json({ ok: true, token: await issueToken(tokenSecret, user.id) });
  }

  const allowed = isOwner || (!!tokenSecret && (await tokenIsValid(tokenSecret, user.id, body.token)));
  if (!allowed) return fail(403, 'forbidden', 'Accès réservé.');

  if (body.action === 'snapshot') {
    try {
      return json(await snapshot(admin));
    } catch (error) {
      console.error('[cockpit] lecture impossible :', String(error));
      return fail(502, 'upstream', 'Les données n’ont pas pu être lues.');
    }
  }
  return fail(400, 'action', 'Action inconnue.');
});
