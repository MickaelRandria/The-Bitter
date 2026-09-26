/**
 * L'e-mail de secours : les invitations et séances restées sans réponse.
 *
 * Appelée toutes les heures de jour par le cron `bitter-relance-email`, avec le
 * jeton de worker des rappels. Envoie par Resend, le service qui envoie déjà les
 * codes de connexion pour thebitter.watch.
 *
 * Secret requis : `RESEND_API_KEY`. Sans lui, la fonction ne fait rien et le dit.
 * `dryRun: true` rend les e-mails construits sans rien envoyer ni marquer : c'est
 * ainsi qu'on vérifie un récapitulatif en production sans déranger personne.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildDigestEmail, DigestItem } from './email.ts';

const APP_URL = 'https://thebitter.watch';
const FROM = 'The Bitter <notifications@thebitter.watch>';

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Digest {
  recipient_id: string;
  email: string;
  first_name: string;
  email_token: string;
  items: DigestItem[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  let body: { workerToken?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'json' }, 400);
  }
  const workerToken = typeof body.workerToken === 'string' ? body.workerToken : '';
  if (!/^[a-f0-9]{64}$/.test(workerToken)) return reply({ error: 'unauthorized' }, 401);
  const dryRun = body.dryRun === true;

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

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey && !dryRun) {
    console.warn('[email-digest] RESEND_API_KEY absent : aucun e-mail envoyé');
    return reply({ skipped: 'no-key' });
  }

  const { data, error } = await admin.rpc('pending_email_digests');
  if (error) {
    console.warn('[email-digest] Récapitulatifs illisibles', error);
    return reply({ error: 'digests' }, 500);
  }
  const digests = (data ?? []) as Digest[];

  const built = digests.map((d) => {
    const unsubscribeUrl = `${APP_URL}/api/unsubscribe?t=${encodeURIComponent(d.email_token)}`;
    return {
      digest: d,
      unsubscribeUrl,
      email: buildDigestEmail({ firstName: d.first_name, items: d.items, appUrl: APP_URL, unsubscribeUrl }),
    };
  });

  if (dryRun) {
    return reply({
      dryRun: true,
      count: built.length,
      // Ni adresse ni jeton dans la réponse : elle finit dans les journaux de pg_net.
      emails: built.map((b) => ({ subject: b.email.subject, items: b.digest.items.length, text: b.email.text.replace(/t=[0-9a-f-]+/g, 't=…') })),
    });
  }

  let sent = 0;
  for (const { digest, email, unsubscribeUrl } of built) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [digest.email],
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            // Désinscription en un clic depuis Gmail ou Apple Mail.
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });
      if (!res.ok) {
        console.warn('[email-digest] Envoi refusé', res.status, (await res.text()).slice(0, 200));
        continue;
      }
      await admin.rpc('mark_emailed', { p_ids: digest.items.map((i) => i.id) });
      sent += 1;
    } catch (e) {
      console.warn('[email-digest] Envoi impossible', String(e));
    }
  }
  console.log('[email-digest] Tour terminé', { candidates: built.length, sent });
  return reply({ sent, candidates: built.length });
});
