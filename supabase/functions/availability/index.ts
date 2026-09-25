/**
 * Chaque matin : les films des listes « à voir » qui sortent aujourd'hui en salle
 * en France, ou qui viennent d'arriver sur une plateforme d'abonnement.
 *
 * Appelée par le cron `bitter-film-attendu`, avec le jeton de worker des rappels :
 * aucun visiteur ne peut la déclencher. Les données de streaming viennent de
 * TMDB, qui les tient de JustWatch (à citer là où on les affiche).
 *
 * Le travail continue après la réponse (`EdgeRuntime.waitUntil`) : pg_net
 * n'attend que quelques secondes, le tour des films peut en prendre davantage.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decide, frenchStreaming, frenchTheatricalDate, parisToday, TmdbMovie } from './logic.ts';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const CONCURRENCY = 4;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Candidate {
  media_type: string;
  tmdb_id: number;
  release_date: string | null;
  providers: string[];
  known: boolean;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  let body: { workerToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'json' }, 400);
  }
  const workerToken = typeof body.workerToken === 'string' ? body.workerToken : '';
  if (!/^[a-f0-9]{64}$/.test(workerToken)) return reply({ error: 'unauthorized' }, 401);

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

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return reply({ error: 'tmdb-key-missing' }, 503);

  const { data: candidates, error } = await admin.rpc('availability_candidates');
  if (error) {
    console.warn('[availability] Candidats illisibles', error);
    return reply({ error: 'candidates' }, 500);
  }

  const today = parisToday();
  const work = async () => {
    const queue = [...((candidates ?? []) as Candidate[])];
    let checked = 0;
    let notified = 0;
    const runOne = async (c: Candidate) => {
      try {
        const res = await fetch(
          `${TMDB_BASE}/movie/${c.tmdb_id}?api_key=${tmdbKey}&append_to_response=release_dates,watch/providers`
        );
        if (!res.ok) return;
        const movie = (await res.json()) as TmdbMovie;
        const release = frenchTheatricalDate(movie);
        const providers = frenchStreaming(movie);
        const decision = decide({ known: c.known, providers: c.providers ?? [] }, release, providers, today);

        const record = (kind: string | null, key: string | null, fresh: string[] | null) =>
          admin.rpc('record_availability', {
            p_media_type: c.media_type,
            p_tmdb_id: c.tmdb_id,
            p_release_date: release,
            p_providers: providers,
            p_kind: kind,
            p_key: key,
            p_new_providers: fresh,
          });

        // L'état est toujours enregistré ; les nouvelles s'y ajoutent.
        const results = [await record(null, null, null)];
        if (decision.release) results.push(await record('release_today', release, null));
        if (decision.newProviders.length) {
          results.push(await record('now_streaming', decision.newProviders.join(','), decision.newProviders));
        }
        checked += 1;
        for (const r of results) {
          if (r.error) console.warn('[availability] Enregistrement refusé', c.tmdb_id, r.error);
          else notified += Number(r.data) || 0;
        }
      } catch (e) {
        console.warn('[availability] TMDB indisponible pour', c.tmdb_id, String(e));
      }
    };
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) await runOne(queue.shift()!);
      })
    );
    console.log('[availability] Tour terminé', { today, checked, notified });
  };

  // @ts-ignore EdgeRuntime est fourni par l'environnement Supabase.
  EdgeRuntime.waitUntil(work());
  return reply({ started: true, candidates: (candidates ?? []).length, today });
});
