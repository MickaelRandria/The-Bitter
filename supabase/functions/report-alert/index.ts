/**
 * Alerte les modérateurs à chaque nouveau signalement.
 *
 * Appelée uniquement par le trigger `content_reports_alert` (pg_net), avec le
 * jeton de worker des rappels : aucun visiteur ne peut déclencher d'envoi.
 * Fonction distincte de `push` pour ne jamais risquer les rappels de séance.
 *
 * La notification ne contient pas le texte signalé : un écran verrouillé n'a pas
 * à afficher des propos injurieux. Elle dit seulement qu'il y a quelque chose à
 * regarder, et pourquoi.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_SUBJECT = 'https://thebitter.watch';
/** Au-delà, un spam de signalements deviendrait un spam de notifications. */
const MAX_ALERTS_PER_HOUR = 10;

const REASONS: Record<string, string> = {
  offensive: 'Propos haineux ou offensants',
  harassment: 'Harcèlement ou menace',
  spam: 'Spam ou publicité',
  inappropriate: 'Contenu choquant ou sexuel',
  other: 'Autre motif',
};

const PLACES: Record<string, string> = {
  review: 'un avis dans un espace',
  feed_item: 'une publication du fil',
  profile: 'un profil de membre',
  space_movie: 'un film proposé dans un espace',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let body: { reportId?: unknown; workerToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'json' }, 400);
  }

  const workerToken = typeof body.workerToken === 'string' ? body.workerToken : '';
  const reportId = typeof body.reportId === 'string' ? body.reportId : '';
  if (!/^[a-f0-9]{64}$/.test(workerToken) || !/^[0-9a-f-]{36}$/.test(reportId)) {
    return reply({ error: 'unauthorized' }, 401);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: credential } = await admin
    .from('push_worker_credentials')
    .select('singleton')
    .eq('singleton', true)
    .eq('worker_token', workerToken)
    .maybeSingle();
  if (!credential) return reply({ error: 'unauthorized' }, 401);

  const { data: report } = await admin
    .from('content_reports')
    .select('id, reason, content_type, alerted_at')
    .eq('id', reportId)
    .maybeSingle();
  if (!report || report.alerted_at) return reply({ skipped: 'unknown-or-done' });

  const since = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const { count } = await admin
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .gte('alerted_at', since);
  if ((count ?? 0) >= MAX_ALERTS_PER_HOUR) {
    console.warn('[report-alert] Plafond horaire atteint, alerte non envoyée', { reportId });
    return reply({ skipped: 'rate-limited' });
  }

  const { data: moderators } = await admin.from('moderators').select('profile_id');
  const ids = (moderators ?? []).map((m: { profile_id: string }) => m.profile_id);
  if (ids.length === 0) return reply({ skipped: 'no-moderator' });

  const { data: devices } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', ids)
    .eq('active', true);
  if (!devices?.length) {
    console.warn('[report-alert] Aucun appareil de modérateur abonné aux notifications');
    return reply({ skipped: 'no-device' });
  }

  const { data: vapid } = await admin
    .from('push_vapid_keys')
    .select('public_key, private_key')
    .eq('singleton', true)
    .maybeSingle();
  if (!vapid?.public_key || !vapid.private_key) return reply({ skipped: 'no-vapid' });
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.public_key, vapid.private_key);

  const payload = JSON.stringify({
    title: 'Nouveau signalement',
    body: `${REASONS[report.reason] ?? 'Signalement'} · ${PLACES[report.content_type] ?? 'contenu'}`,
    icon: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
    badge: 'https://thebitter.watch/favicon_io/android-chrome-192x192.png',
    tag: `report-${report.id}`,
    data: { url: '/' },
  });

  const results = await Promise.all(
    devices.map(async (device: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          { TTL: 24 * 60 * 60, urgency: 'normal' }
        );
        return true;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode);
        if (statusCode === 404 || statusCode === 410) {
          await admin
            .from('push_subscriptions')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('id', device.id);
        }
        console.warn('[report-alert] Envoi refusé', { statusCode });
        return false;
      }
    })
  );

  const sent = results.filter(Boolean).length;
  if (sent > 0) {
    await admin.from('content_reports').update({ alerted_at: new Date().toISOString() }).eq('id', report.id);
  }
  return reply({ sent });
});
