/**
 * Suppression définitive d'un compte The Bitter.
 *
 * L'App Store (règle 5.1.1 v) exige que toute application permettant de créer un
 * compte permette aussi de le supprimer depuis l'application. Le RGPD demande la
 * même chose au titre du droit à l'effacement.
 *
 * Le point délicat n'est pas la suppression elle-même, c'est ce qu'elle entraîne :
 * `shared_spaces.created_by` est en CASCADE. Supprimer le profil d'un créateur
 * d'espace effacerait donc l'espace entier — et avec lui les films et les votes de
 * tous les autres membres. On transmet donc la propriété avant de supprimer, et on
 * ne détruit un espace que si son créateur en était le dernier membre.
 *
 * `profiles` n'a aucune clé étrangère vers `auth.users` : les deux suppressions
 * sont indépendantes et doivent être faites explicitement. L'utilisateur Auth part
 * en dernier, pour qu'un échec en cours de route laisse un compte encore
 * connectable capable de relancer l'opération.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 2_000;

/** Le client tape ce mot pour confirmer. Il rend l'appel accidentel impossible. */
const CONFIRMATION = 'SUPPRIMER';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (status: number, code: string, message: string) => json({ code, message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Requête POST attendue.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail(413, 'payload-too-large', 'Requête trop volumineuse.');
  }

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid-json', 'Corps JSON invalide.');
  }

  if (body.confirm !== CONFIRMATION) {
    return fail(400, 'confirmation-required', 'Confirmation manquante.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return fail(503, 'server-misconfigured', 'Configuration serveur incomplète.');
  }

  // La clé anonyme est elle-même un JWT public : seul getUser() prouve qu'il y a
  // un vrai utilisateur derrière l'appel.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('authorization') || '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return fail(401, 'authentication-required', 'Connecte-toi pour supprimer ton compte.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Espaces créés par l'utilisateur : transmettre plutôt que détruire.
  const { data: ownedSpaces, error: spacesError } = await admin
    .from('shared_spaces')
    .select('id')
    .eq('created_by', user.id);

  if (spacesError) {
    console.error('[Delete account] Lecture des espaces impossible', spacesError);
    return fail(500, 'spaces-read-failed', 'Impossible de préparer la suppression.');
  }

  let transferred = 0;
  let removed = 0;

  for (const space of ownedSpaces || []) {
    const { data: successor, error: successorError } = await admin
      .from('space_members')
      .select('profile_id')
      .eq('space_id', space.id)
      .eq('is_active', true)
      .neq('profile_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (successorError) {
      console.error('[Delete account] Recherche de successeur impossible', successorError);
      return fail(500, 'successor-lookup-failed', 'Impossible de préparer la suppression.');
    }

    if (successor?.profile_id) {
      // Le plus ancien membre encore actif reprend l'espace. Sans ce transfert, la
      // cascade sur created_by emporterait les données de tout le monde.
      const { error: handoverError } = await admin
        .from('shared_spaces')
        .update({ created_by: successor.profile_id, updated_at: new Date().toISOString() })
        .eq('id', space.id);
      if (handoverError) {
        console.error('[Delete account] Transfert de propriété impossible', handoverError);
        return fail(500, 'handover-failed', 'Impossible de transmettre un espace partagé.');
      }

      const { error: roleError } = await admin
        .from('space_members')
        .update({ role: 'owner' })
        .eq('space_id', space.id)
        .eq('profile_id', successor.profile_id);
      if (roleError) {
        console.error('[Delete account] Promotion du successeur impossible', roleError);
        return fail(500, 'handover-failed', 'Impossible de transmettre un espace partagé.');
      }

      transferred += 1;
    } else {
      // Dernier membre : l'espace n'a plus de raison d'exister.
      const { error: dropError } = await admin.from('shared_spaces').delete().eq('id', space.id);
      if (dropError) {
        console.error('[Delete account] Suppression d’un espace impossible', dropError);
        return fail(500, 'space-delete-failed', 'Impossible de supprimer un espace partagé.');
      }
      removed += 1;
    }
  }

  // 2. `ai_usage` ne porte pas de clé étrangère : aucune cascade ne la nettoie.
  const { error: usageError } = await admin.from('ai_usage').delete().eq('user_id', user.id);
  if (usageError) {
    console.error('[Delete account] Purge du quota IA impossible', usageError);
    return fail(500, 'usage-delete-failed', 'Impossible de supprimer les données d’usage.');
  }

  // 3. Le profil entraîne en cascade films, notes, séances, votes, appartenances
  //    aux espaces, abonnements push et rappels programmés.
  const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id);
  if (profileError) {
    console.error('[Delete account] Suppression du profil impossible', profileError);
    return fail(500, 'profile-delete-failed', 'Impossible de supprimer tes données.');
  }

  // 4. L'identité elle-même, en dernier : tant qu'elle existe, l'utilisateur peut
  //    relancer l'opération si une étape a échoué.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error('[Delete account] Suppression de l’identité impossible', authError);
    return fail(500, 'auth-delete-failed', 'Tes données sont supprimées, mais l’identifiant subsiste.');
  }

  return json({ ok: true, spacesTransferred: transferred, spacesRemoved: removed });
});
