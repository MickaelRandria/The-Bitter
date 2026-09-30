import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parisToday, seriesAlerts, TmdbSeries } from './logic.ts';

/**
 * Chaque matin : les séries suivies dont un épisode est diffusé aujourd'hui,
 * dont une saison commence aujourd'hui, ou dans trois jours.
 *
 * Appelée par le cron `bitter-series`, avec le jeton de worker des rappels :
 * aucun visiteur ne peut la déclencher. Le tri de qui est concerné (qui en est
 * à cette saison) se fait en base, dans `record_series_alert`. Chaque
 * notification insérée part ensuite en push par le déclencheur de `notify`.
 *
 * Le travail continue après la réponse (`EdgeRuntime.waitUntil`) : pg_net
 * n'attend que quelques secondes, le tour des séries peut en prendre davantage.
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const CONCURRENCY = 4;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
  const { data: credential } = await admin
    .from('push_worker_credentials')
    .select('singleton')
    .eq('singleton', true)
    .eq('worker_token', workerToken)
    .maybeSingle();
  if (!credential) return reply({ error: 'unauthorized' }, 401);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return reply({ error: 'tmdb-key-missing' }, 503);

  const { data: candidates, error } = await admin.rpc('series_alert_candidates');
  if (error) {
    console.warn('[series-alerts] Candidats illisibles', error);
    return reply({ error: 'candidates' }, 500);
  }

  const today = parisToday();
  const work = async () => {
    const queue = ((candidates ?? []) as { tmdb_id: number }[]).map((c) => c.tmdb_id);
    let checked = 0;
    let notified = 0;
    const runOne = async (tmdbId: number) => {
      try {
        const res = await fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${tmdbKey}`);
        if (!res.ok) return;
        const series = (await res.json()) as TmdbSeries;
        checked += 1;
        for (const alert of seriesAlerts(series, today)) {
          const { data, error: recordError } = await admin.rpc('record_series_alert', {
            p_tmdb_id: tmdbId,
            p_kind: alert.kind,
            p_season: alert.season,
            p_episode: alert.episode,
            p_air_date: alert.airDate,
          });
          if (recordError)
            console.warn('[series-alerts] Enregistrement refusé', tmdbId, recordError);
          else notified += Number(data) || 0;
        }
      } catch (e) {
        console.warn('[series-alerts] TMDB indisponible pour', tmdbId, String(e));
      }
    };
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) await runOne(queue.shift()!);
      })
    );
    console.log('[series-alerts] Tour terminé', { today, checked, notified });
  };

  // @ts-ignore EdgeRuntime est fourni par l'environnement Supabase.
  EdgeRuntime.waitUntil(work());
  return reply({ started: true, candidates: (candidates ?? []).length, today });
});
