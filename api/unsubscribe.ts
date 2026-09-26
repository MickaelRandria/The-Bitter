/**
 * Désinscription des e-mails de secours, en un clic : thebitter.watch/api/unsubscribe?t=…
 *
 * GET depuis le lien de l'e-mail, POST depuis le bouton « Se désabonner » de
 * Gmail ou d'Apple Mail (en-tête List-Unsubscribe-Post). Le jeton identifie le
 * compte sans session ; il ne donne accès à rien d'autre.
 *
 * Rien n'est importé hors d'`api/` : le build Vercel le refuse.
 */
export const config = { runtime: 'edge' };

const FALLBACK_URL = 'https://tnvnmsevddvcklkitnpa.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudm5tc2V2ZGR2Y2tsa2l0bnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDgwMTMsImV4cCI6MjA4NTk4NDAxM30.cQi9F7ECVNOk8h8JYoCWATqV3XUwjL4qE_8FQeisHXk';

/**
 * Toujours le projet de production : les prévisualisations Vercel pointent vers
 * un autre projet Supabase, où ce jeton n'existe pas.
 */
const unsubscribe = async (token: string): Promise<string | null | undefined> => {
  const res = await fetch(`${FALLBACK_URL}/rest/v1/rpc/unsubscribe_email`, {
    method: 'POST',
    headers: { apikey: FALLBACK_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) return undefined;
  return (await res.json()) as string | null;
};

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · The Bitter</title>
<style>:root{--g:#FDFCF8;--s:#FFFFFF;--i:#1A1A1A;--m:#4A4A46;--l:#E7E4DC;--a:#3E5238}
@media (prefers-color-scheme:dark){:root{--g:#0C0C0C;--s:#161616;--i:#F5F5F0;--m:#C8C8C0;--l:#262626;--a:#D9FF00}}
body{margin:0;background:var(--g);color:var(--i);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;margin:0 auto;padding:2rem 1rem}.b{font-size:.7rem;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#8A8A82;text-decoration:none}
.c{margin-top:1.5rem;background:var(--s);border:1px solid var(--l);border-radius:1.5rem;padding:1.25rem}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:var(--m);line-height:1.5;margin:0}
a.k{display:inline-block;margin-top:1rem;color:var(--a);font-weight:800}</style></head>
<body><main><a class="b" href="/">The Bitter</a><div class="c"><h1>${title}</h1><p>${text}</p><a class="k" href="/">Ouvrir The Bitter</a></div></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );

export default async function handler(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return page('Lien incomplet', 'Ce lien de désinscription est incomplet. Tu peux aussi couper ces e-mails depuis la cloche de l’app.', 400);
  }
  let name: string | null | undefined;
  try {
    name = await unsubscribe(token);
  } catch {
    name = undefined;
  }
  if (req.method === 'POST') return new Response(null, { status: name === undefined ? 502 : 200 });
  if (name === undefined) {
    return page('Réessaie dans un instant', 'La désinscription n’a pas pu être enregistrée. Réessaie, ou coupe ces e-mails depuis la cloche de l’app.', 502);
  }
  return page(
    'C’est noté',
    `${name ? `${name}, tu` : 'Tu'} ne recevras plus d’e-mails de rappel. Les notifications de l’app restent actives ; tu peux réactiver les e-mails depuis la cloche.`
  );
}
