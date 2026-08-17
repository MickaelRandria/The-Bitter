/**
 * Rappels Web Push de The Bitter.
 *
 * Deux portes d'entrée seulement :
 * - l'application connectée peut enregistrer ou retirer SON abonnement ;
 * - le Cron PostgreSQL peut traiter les rappels arrivés à échéance.
 *
 * La seconde porte est protégée par un jeton aléatoire gardé dans une table RLS
 * inaccessible au Data API. L'Edge Function le relit avec service_role : aucun
 * visiteur ne peut faire partir des rappels à la demande.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 12_000;
const MAX_BATCH_SIZE = 25;
const VAPID_SUBJECT = 'https://thebitter.watch';

type Action = 'config' | 'subscribe' | 'unsubscribe' | 'test' | 'process';

interface PushSubscriptionInput {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

interface ClaimedDelivery {
  delivery_id: string;
  attempt_number: number;
  profile_id: string;
  screening_id: string;
  reminder_offset_minutes: number;
  title: string;
  starts_at: string;
  cinema_name: string | null;
  cinema_address: string | null;
  format: string | null;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_test_at?: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fail = (status: number, code: string, message: string) => json({ code, message }, status);

const base64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** Fabrique une paire compatible VAPID, sans jamais exposer la partie privée. */
const generateVapidKeys = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) throw new Error('Impossible de créer les clés VAPID');

  const publicKey = base64Url(
    Uint8Array.from([4, ...base64UrlToBytes(publicJwk.x), ...base64UrlToBytes(publicJwk.y)])
  );
  return { publicKey, privateKey: privateJwk.d };
};

const isBase64Url = (value: string, min: number, max: number) =>
  value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);

const validEndpoint = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const validSubscription = (value: unknown): { endpoint: string; p256dh: string; auth: string } | null => {
  const input = value as PushSubscriptionInput;
  const endpoint = validEndpoint(input?.endpoint);
  const p256dh = typeof input?.keys?.p256dh === 'string' ? input.keys.p256dh : '';
  const auth = typeof input?.keys?.auth === 'string' ? input.keys.auth : '';
  if (!endpoint || !isBase64Url(p256dh, 40, 300) || !isBase64Url(auth, 10, 100)) return null;
  return { endpoint, p256dh, auth };
};

const formatStartsAt = (value: string): string =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));

const notificationFor = (delivery: ClaimedDelivery) => {
  const startsAt = formatStartsAt(delivery.starts_at);
  const place = [delivery.cinema_name, delivery.format].filter(Boolean).join(' · ');
  const isSoon = delivery.reminder_offset_minutes <= 60;
  // iOS ajoute le nom de l'app séparément. Le titre reste donc le film, et le
  // détail utile est regroupé dans le sous-texte, sans caractères ambigus.
  const title = delivery.title;
  const timing = isSoon ? `Dans ${delivery.reminder_offset_minutes} min` : startsAt;
  const body = [timing, place].filter(Boolean).join(' · ');
  return {
    title,
    body,
    // Ce fichier n'a jamais existé : les vrais rappels partaient donc avec une
    // icône introuvable, alors que la notification de test, qui pointe ailleurs,
    // s'affichait correctement. D'où un bug invisible en test.
    icon: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
    badge: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
    tag: `screening-${delivery.screening_id}-${delivery.reminder_offset_minutes}`,
    data: { url: `/?screening=${delivery.screening_id}`, screeningId: delivery.screening_id },
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Requête POST attendue.');

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail(413, 'payload-too-large', 'Requête trop volumineuse.');
  }

  let body: { action?: unknown; subscription?: unknown; endpoint?: unknown; workerToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid-json', 'Corps JSON invalide.');
  }

  const action = body.action as Action;
  if (!['config', 'subscribe', 'unsubscribe', 'test', 'process'].includes(action)) {
    return fail(400, 'invalid-action', 'Action de notification inconnue.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return fail(503, 'server-misconfigured', 'Configuration serveur incomplète.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const getVapidKeys = async () => {
    const { data: stored, error } = await admin
      .from('push_vapid_keys')
      .select('public_key, private_key')
      .eq('singleton', true)
      .maybeSingle();
    if (error) throw error;
    if (stored?.public_key && stored.private_key) return stored;

    const generated = await generateVapidKeys();
    const { error: insertError } = await admin.from('push_vapid_keys').insert({
      singleton: true,
      public_key: generated.publicKey,
      private_key: generated.privateKey,
    });
    if (!insertError) return { public_key: generated.publicKey, private_key: generated.privateKey };

    // Deux premiers téléphones peuvent arriver en même temps : le gagnant a créé
    // la paire, le second relit simplement celle qui est désormais enregistrée.
    const { data: concurrent, error: concurrentError } = await admin
      .from('push_vapid_keys')
      .select('public_key, private_key')
      .eq('singleton', true)
      .single();
    if (concurrentError || !concurrent) throw concurrentError || insertError;
    return concurrent;
  };

  if (action === 'process') {
    const workerToken = typeof body.workerToken === 'string' ? body.workerToken : '';
    if (!/^[a-f0-9]{64}$/.test(workerToken)) return fail(401, 'unauthorized-worker', 'Worker non autorisé.');

    const { data: credential, error: credentialError } = await admin
      .from('push_worker_credentials')
      .select('singleton')
      .eq('singleton', true)
      .eq('worker_token', workerToken)
      .maybeSingle();
    if (credentialError || !credential) return fail(401, 'unauthorized-worker', 'Worker non autorisé.');

    let vapid: { public_key: string; private_key: string };
    try {
      vapid = await getVapidKeys();
      webpush.setVapidDetails(VAPID_SUBJECT, vapid.public_key, vapid.private_key);
    } catch (error) {
      console.error('[Push] Clés VAPID indisponibles', error);
      return fail(503, 'vapid-unavailable', 'Service de notifications indisponible.');
    }

    const { data: deliveries, error: claimError } = await admin.rpc('claim_due_notification_deliveries', {
      p_limit: MAX_BATCH_SIZE,
    });
    if (claimError) {
      console.error('[Push] Impossible de réserver les rappels', claimError);
      return fail(500, 'claim-failed', 'Impossible de traiter les rappels.');
    }

    const claimed = (deliveries || []) as ClaimedDelivery[];
    const outcomes = await Promise.all(
      claimed.map(async (delivery) => {
        const { data: subscriptions, error: subscriptionsError } = await admin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('profile_id', delivery.profile_id)
          .eq('active', true);

        if (subscriptionsError) {
          await admin
            .from('notification_deliveries')
            .update({
              status: delivery.attempt_number >= 3 ? 'failed' : 'pending',
              processing_started_at: null,
              last_error: 'Lecture des appareils impossible',
            })
            .eq('id', delivery.delivery_id)
            .eq('status', 'processing');
          return { id: delivery.delivery_id, sent: false };
        }

        const devices = (subscriptions || []) as StoredSubscription[];
        if (devices.length === 0) {
          await admin
            .from('notification_deliveries')
            .update({
              status: 'skipped',
              processing_started_at: null,
              last_error: 'Aucun appareil autorisé',
            })
            .eq('id', delivery.delivery_id)
            .eq('status', 'processing');
          return { id: delivery.delivery_id, sent: false };
        }

        const payload = JSON.stringify(notificationFor(delivery));
        const results = await Promise.all(
          devices.map(async (device) => {
            try {
              await webpush.sendNotification(
                { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
                payload,
                { TTL: 60 * 60, urgency: 'high' }
              );
              await admin
                .from('push_subscriptions')
                .update({ last_success_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', device.id);
              return true;
            } catch (error: any) {
              const statusCode = Number(error?.statusCode);
              if (statusCode === 404 || statusCode === 410) {
                await admin
                  .from('push_subscriptions')
                  .update({ active: false, updated_at: new Date().toISOString() })
                  .eq('id', device.id);
              }
              console.warn('[Push] Envoi à un appareil échoué', { statusCode, endpoint: device.endpoint });
              return false;
            }
          })
        );

        const sent = results.some(Boolean);
        await admin
          .from('notification_deliveries')
          .update(
            sent
              ? { status: 'sent', sent_at: new Date().toISOString(), processing_started_at: null, last_error: null }
              : {
                  status: delivery.attempt_number >= 3 ? 'failed' : 'pending',
                  processing_started_at: null,
                  last_error: 'Tous les appareils ont refusé le rappel',
                }
          )
          .eq('id', delivery.delivery_id)
          .eq('status', 'processing');
        return { id: delivery.delivery_id, sent };
      })
    );

    return json({ processed: outcomes.length, sent: outcomes.filter((outcome) => outcome.sent).length });
  }

  // Les trois actions restantes exigent un vrai utilisateur. La clé anonyme est
  // elle-même un JWT public ; auth.getUser() est donc indispensable ici.
  const authorization = req.headers.get('authorization') || '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return fail(401, 'authentication-required', 'Connecte-toi pour activer les rappels.');

  if (action === 'config') {
    try {
      const vapid = await getVapidKeys();
      return json({ publicKey: vapid.public_key });
    } catch (error) {
      console.error('[Push] Lecture de configuration impossible', error);
      return fail(503, 'push-unavailable', 'Les notifications ne sont pas disponibles pour le moment.');
    }
  }

  if (action === 'test') {
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, last_test_at')
      .eq('profile_id', user.id)
      .eq('active', true);
    if (subscriptionsError) return fail(500, 'subscription-read-failed', 'Impossible de lire cet appareil.');

    const minimumTestTime = Date.now() - 60_000;
    const devices = ((subscriptions || []) as StoredSubscription[]).filter((device) => {
      const lastTest = device.last_test_at ? new Date(device.last_test_at).getTime() : 0;
      return !Number.isFinite(lastTest) || lastTest < minimumTestTime;
    });
    if (devices.length === 0) {
      return fail(429, 'test-rate-limited', 'Attends une minute avant un nouveau test.');
    }

    try {
      const vapid = await getVapidKeys();
      webpush.setVapidDetails(VAPID_SUBJECT, vapid.public_key, vapid.private_key);
    } catch (error) {
      console.error('[Push] Test impossible : clés VAPID indisponibles', error);
      return fail(503, 'push-unavailable', 'Les notifications ne sont pas disponibles pour le moment.');
    }

    const payload = JSON.stringify({
      title: 'Rappels activés',
      body: 'The Bitter t’avertira uniquement pour les séances que tu planifies.',
      icon: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
      badge: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
      tag: `bitter-push-test-${user.id}`,
      data: { url: '/' },
    });
    const results = await Promise.all(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            payload,
            { TTL: 60, urgency: 'high' }
          );
          await admin
            .from('push_subscriptions')
            .update({ last_test_at: new Date().toISOString(), last_success_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', device.id);
          return true;
        } catch (error: any) {
          const statusCode = Number(error?.statusCode);
          if (statusCode === 404 || statusCode === 410) {
            await admin
              .from('push_subscriptions')
              .update({ active: false, updated_at: new Date().toISOString() })
              .eq('id', device.id);
          }
          console.warn('[Push] Test refusé par un appareil', { statusCode, endpoint: device.endpoint });
          return false;
        }
      })
    );
    const sent = results.filter(Boolean).length;
    if (sent === 0) return fail(502, 'test-delivery-failed', 'Aucun appareil n’a accepté la notification de test.');
    return json({ ok: true, sent });
  }

  if (action === 'subscribe') {
    const subscription = validSubscription(body.subscription);
    if (!subscription) return fail(400, 'invalid-subscription', 'Abonnement navigateur invalide.');

    const { error } = await admin.from('push_subscriptions').upsert(
      {
        profile_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,endpoint' }
    );
    if (error) {
      console.error('[Push] Enregistrement de l’appareil échoué', error);
      return fail(500, 'subscription-save-failed', 'Impossible d’enregistrer cet appareil.');
    }
    return json({ ok: true });
  }

  const endpoint = validEndpoint(body.endpoint);
  if (!endpoint) return fail(400, 'invalid-endpoint', 'Appareil invalide.');
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('profile_id', user.id)
    .eq('endpoint', endpoint);
  if (error) {
    console.error('[Push] Suppression de l’appareil échouée', error);
    return fail(500, 'unsubscribe-failed', 'Impossible de désactiver les notifications.');
  }
  return json({ ok: true });
});
