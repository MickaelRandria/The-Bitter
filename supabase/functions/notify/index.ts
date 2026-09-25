/**
 * Push des notifications sociales : « voir avec… », « ton avis ? », liens.
 *
 * Appelée uniquement par le trigger `notifications_push` (pg_net), avec le jeton
 * de worker des rappels : aucun visiteur ne peut faire partir une notification.
 * Fonction distincte de `push`, comme `report-alert`, pour ne jamais risquer les
 * rappels de séance.
 *
 * La notification existe déjà en base quand cette fonction tourne : si l'envoi
 * échoue, elle reste dans la cloche de l'app. Le push n'est qu'un signal en plus.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { socialMessage, SocialKind } from './messages.ts';

const VAPID_SUBJECT = 'https://thebitter.watch';
const ICON = 'https://thebitter.watch/favicon_io/android-chrome-192x192.png';
/** Au-delà, des relances en rafale deviendraient du harcèlement. */
const MAX_PUSHES_PER_HOUR = 6;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  let body: { notificationId?: unknown; workerToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'json' }, 400);
  }

  const workerToken = typeof body.workerToken === 'string' ? body.workerToken : '';
  const notificationId = typeof body.notificationId === 'string' ? body.notificationId : '';
  if (!/^[a-f0-9]{64}$/.test(workerToken) || !/^[0-9a-f-]{36}$/.test(notificationId)) {
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

  const { data: notification } = await admin
    .from('notifications')
    .select('id, recipient_id, actor_id, kind, shared_movie_id, share_link_id, title, guest_name, rating, read_at, pushed_at')
    .eq('id', notificationId)
    .maybeSingle();
  if (!notification || notification.pushed_at) return reply({ skipped: 'unknown-or-done' });
  // Déjà lue avant d'être poussée (réponse donnée dans l'app entre-temps) : rien à signaler.
  if (notification.read_at) return reply({ skipped: 'already-read' });

  const since = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', notification.recipient_id)
    .gte('pushed_at', since);
  if ((count ?? 0) >= MAX_PUSHES_PER_HOUR) return reply({ skipped: 'rate-limited' });

  const { data: devices } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', notification.recipient_id)
    .eq('active', true);
  if (!devices?.length) return reply({ skipped: 'no-device' });

  let actor: string | null = null;
  if (notification.actor_id) {
    const { data } = await admin.from('profiles').select('first_name').eq('id', notification.actor_id).maybeSingle();
    actor = data?.first_name ?? null;
  }

  // Sa propre note, pour donner l'écart : c'est lui qui donne envie d'en parler.
  let ownRating: number | null = null;
  let linkKind: 'watch' | 'verdict' | null = null;
  if (notification.share_link_id) {
    const { data } = await admin
      .from('share_links')
      .select('kind, inviter_rating')
      .eq('id', notification.share_link_id)
      .maybeSingle();
    linkKind = (data?.kind as 'watch' | 'verdict') ?? null;
    const r = data?.inviter_rating as Record<string, unknown> | null;
    if (r) {
      const weighted = Number((r.adaptive_rating as Record<string, unknown> | undefined)?.weightedRating);
      const avg = ['story', 'visuals', 'acting', 'sound'].reduce((sum, k) => sum + Number(r[k] ?? 0), 0) / 4;
      ownRating = Number.isFinite(weighted) && weighted > 0 ? weighted : avg;
    }
  } else if (notification.kind === 'verdict_given' && notification.shared_movie_id) {
    const { data } = await admin
      .from('movie_ratings')
      .select('story, visuals, acting, sound, adaptive_rating')
      .eq('movie_id', notification.shared_movie_id)
      .eq('profile_id', notification.recipient_id)
      .maybeSingle();
    if (data) {
      const weighted = Number((data.adaptive_rating as Record<string, unknown> | null)?.weightedRating);
      const avg = (Number(data.story) + Number(data.visuals) + Number(data.acting) + Number(data.sound)) / 4;
      ownRating = Number.isFinite(weighted) && weighted > 0 ? weighted : avg;
    }
  }

  const message = socialMessage({
    kind: notification.kind as SocialKind,
    actor,
    guestName: notification.guest_name,
    title: notification.title,
    rating: notification.rating,
    ownRating,
    linkKind,
  });

  const { data: vapid } = await admin
    .from('push_vapid_keys')
    .select('public_key, private_key')
    .eq('singleton', true)
    .maybeSingle();
  if (!vapid?.public_key || !vapid.private_key) return reply({ skipped: 'no-vapid' });
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.public_key, vapid.private_key);

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    icon: ICON,
    badge: ICON,
    // Une notification par film et par sorte : la suivante remplace la précédente
    // au lieu de s'empiler sur l'écran verrouillé.
    tag: `social-${notification.kind}-${notification.shared_movie_id ?? notification.share_link_id ?? notification.id}`,
    data: { url: `/?notif=${notification.id}` },
  });

  const results = await Promise.all(
    devices.map(async (device: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          { TTL: 3 * 24 * 60 * 60, urgency: 'normal' }
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
        console.warn('[notify] Envoi refusé', { statusCode });
        return false;
      }
    })
  );

  const sent = results.filter(Boolean).length;
  if (sent > 0) {
    await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', notification.id);
  }
  return reply({ sent });
});
