import { CINEMA_NEWS_SOURCES, parseCinemaRss } from '../utils/cinemaNews';
import type { FilNews } from '../utils/cinemaFil';

let cache: { at: number; items: FilNews[]; partial: boolean } | null = null;
let pending: Promise<typeof cache> | null = null;

async function refresh() {
  const results = await Promise.allSettled(CINEMA_NEWS_SOURCES.map(async source => {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok || !source.hosts.includes(new URL(response.url).hostname)) throw Error('RSS unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw Error('Empty RSS');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) throw Error('RSS too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const text = Buffer.concat(chunks).toString('utf8');
    const items = parseCinemaRss(text, source);
    if (!items.length) throw Error('No current RSS items');
    return items;
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length) throw Error('News sources unavailable');
  const unique = [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  cache = { at: Date.now(), items: unique, partial: results.some(r => r.status === 'rejected') };
  return cache;
}

/** Relais public et sans clé : le navigateur n'a pas à contourner le CORS des éditeurs. */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method-not-allowed' }); }
  try {
    if (!cache || Date.now() - cache.at > (cache.partial ? 120_000 : 900_000)) {
      pending ??= refresh().finally(() => { pending = null; });
      await pending;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({ items: cache!.items, partial: cache!.partial, updatedAt: new Date(cache!.at).toISOString() });
  } catch {
    if (cache) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(200).json({ items: cache.items, partial: true, stale: true }); }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ items: [], error: 'news-unavailable' });
  }
}
