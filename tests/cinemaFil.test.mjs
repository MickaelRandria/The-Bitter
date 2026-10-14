import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, deps = {}, fetcher = fetch) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', source)(exports, name => {
    if (deps[name]) return deps[name];
    throw Error(`Unexpected import: ${name}`);
  }, fetcher);
  return exports;
}
const fil = load('../utils/cinemaFil.ts');
const rss = load('../utils/cinemaNews.ts');
const now = Date.parse('2026-10-14T12:00:00Z');
const source = { name: 'Publisher', hosts: ['example.org'], mediaType: 'movie', url: 'https://example.org/rss' };
const xml = (items) => `<rss><channel>${items}</channel></rss>`;
const item = (extra = '') => `<item><title><![CDATA[Les nouvelles de « Dune » &amp; son univers]]></title><description><![CDATA[<p>Un &quot;film&quot; &#xE0; suivre.</p>]]></description><link>https://example.org/dune?utm_source=rss#tracking</link><pubDate>Wed, 14 Oct 2026 09:00:00 +0200</pubDate><media:content url="https://images.example.org/a.jpg"/>${extra}</item>`;

test('RSS : entités, CDATA, source, date et image deviennent une carte de texte', () => {
  const rows = rss.parseCinemaRss(xml(item()), source, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Les nouvelles de « Dune » & son univers');
  assert.equal(rows[0].description, 'Un "film" à suivre.');
  assert.equal(rows[0].sourceUrl, 'https://example.org/dune');
  assert.equal(rows[0].publishedAt, '2026-10-14T07:00:00.000Z');
  assert.equal(rows[0].image, 'https://images.example.org/a.jpg');
  assert.ok(fil.validFilItemId(rows[0].id));
});
test('RSS : doublons, dates fausses ou anciennes, liens étrangers et protocoles actifs sont écartés', () => {
  const good = item();
  const entries = [good, good, good.replace('2026', '2020'), good.replace('Wed, 14 Oct 2026 09:00:00 +0200', 'bad date'),
    good.replace('example.org/dune', 'evil.example/dune'), good.replace('https://example.org/dune?utm_source=rss#tracking', 'javascript:alert(1)')];
  assert.equal(rss.parseCinemaRss(xml(entries.join('')), source, now).length, 1);
  assert.deepEqual(rss.parseCinemaRss('<html>Not RSS</html>', source, now), []);
});
test('RSS : une URL nettoyée conserve le même identifiant entre deux visites', () => {
  assert.equal(rss.parseCinemaRss(xml(item()), source, now)[0].id,
    rss.parseCinemaRss(xml(item().replace('?utm_source=rss#tracking', '')), source, now)[0].id);
});
test('une actu se relie seulement à un titre connu, au bon type et sans correspondance partielle', () => {
  const news = { ...rss.parseCinemaRss(xml(item()), source, now)[0], title: 'Severance : un retour annoncé' };
  const work = { mediaType: 'tv', tmdbId: 95396, title: 'Severance', poster: null };
  assert.equal(fil.associateNews(news, [work], new Set(['tv:95396'])).work, undefined);
  const match = fil.associateNews({ ...news, mediaType: 'tv' }, [work], new Set(['tv:95396']));
  assert.equal(match.work.tmdbId, 95396); assert.equal(match.reason, 'following');
  assert.equal(fil.associateNews({ ...news, title: 'Severanceous' }, [work], new Set()).work, undefined);
  assert.equal(fil.filWorkKey('movie', 1), 'movie:1'); assert.equal(fil.filWorkKey('tv', 1), 'tv:1');
  const dune = { mediaType: 'movie', tmdbId: 438631, title: 'Dune', poster: null };
  assert.equal(fil.associateNews({ ...news, title: 'Des nouvelles de « Dune »' }, [dune], new Set()).work.tmdbId, 438631);
  assert.equal(fil.associateNews({ ...news, title: 'Une dune au cinéma' }, [dune], new Set()).work, undefined);
});
test('le Fil alterne les familles et retire les doublons et les actus périmées', () => {
  const make = (id, kind) => ({ id, kind, mediaType: 'movie', publishedAt: '2026-10-14T07:00:00Z' });
  const result = fil.assembleFil([[make('n1', 'news'), make('n2', 'news'), { ...make('old', 'news'), publishedAt: '2020-01-01' }],
    [make('t1', 'trailer'), make('t1', 'trailer')], [make('d1', 'discovery')]], new Set(), now);
  assert.deepEqual(result.map(i => i.id), ['n1', 't1', 'd1', 'n2']);
});
test('les filtres combinent type de contenu et Films / Séries', () => {
  const rows = [{ id: '1', kind: 'news', mediaType: 'tv' }, { id: '2', kind: 'release', mediaType: 'movie' }, { id: '3', kind: 'trailer', mediaType: 'tv' }];
  assert.deepEqual(fil.filterFil(rows, 'news', 'tv').map(i => i.id), ['1']);
  assert.deepEqual(fil.filterFil(rows, 'trailers', 'all').map(i => i.id), ['3']);
  assert.equal(fil.filterFil(rows, 'foryou', 'all').length, 3);
});
test('le relais RSS reste utile si un éditeur est indisponible, et se met en cache', async () => {
  let calls = 0;
  const fetcher = async url => {
    calls++; if (url.includes('series')) throw Error('offline');
    const info = rss.CINEMA_NEWS_SOURCES.find(s => s.url === url);
    const text = xml(item().replaceAll('example.org', info.hosts[0]).replace('Wed, 14 Oct 2026 09:00:00 +0200', new Date().toUTCString()));
    return { ok: true, url, body: new Response(text).body };
  };
  const api = load('../api/cinema-news.ts', { '../utils/cinemaNews.js': rss }, fetcher).default;
  let status, payload; const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; }, status: n => { status = n; return res; }, json: body => { payload = body; } };
  await api({ method: 'GET' }, res);
  assert.equal(status, 200); assert.equal(payload.partial, true); assert.equal(payload.items.length, 2);
  await api({ method: 'GET' }, res); assert.equal(calls, 3);
  await api({ method: 'POST' }, res); assert.equal(status, 405); assert.equal(calls, 3);
});
test('le relais annonce une panne réelle lorsque tous les flux échouent', async () => {
  const api = load('../api/cinema-news.ts', { '../utils/cinemaNews.js': rss }, async () => { throw Error('offline'); }).default;
  let status, payload; const res = { setHeader() {}, status: n => { status = n; return res; }, json: body => { payload = body; } };
  await api({ method: 'GET' }, res); assert.equal(status, 503); assert.deepEqual(payload.items, []);
});

function service(fetcher, extra = {}) {
  return load('../services/cinemaFil.ts', {
    '../constants': { TMDB_API_KEY: 'test', TMDB_BASE_URL: 'https://tmdb.example' },
    './supabase': { supabase: null },
    './tmdb': { getTheatreReleases: async () => ({ thisWeek: [], upcoming: [] }), getRecommendations: async () => [] },
    './trailers': { bestVideo: async () => ({ key: 'abcdefghijk', kind: 'Trailer' }) },
    '../utils/tmdbImage': { tmdbImage: p => 'https://images.example' + p },
    '../utils/rating': { hasVerdict: () => true, getDisplayWeightedRating: () => 9 },
    '../utils/cinemaFil': fil,
    ...extra,
  }, fetcher);
}
test('un nouveau profil sans note reçoit des découvertes et bandes-annonces de films et séries', async () => {
  const request = async url => new Response(JSON.stringify(url === '/api/cinema-news' ? { items: [] } : { results: [
    { id: 1, media_type: 'movie', title: 'A movie', poster_path: '/m.jpg' }, { id: 1, media_type: 'tv', name: 'A series', poster_path: '/t.jpg' }, { id: 2, media_type: 'person', name: 'Actor' },
  ] }));
  const result = await service(request).getCinemaFil([], [], 'fr');
  assert.equal(result.data.filter(i => i.kind === 'discovery').length, 2);
  assert.equal(result.data.filter(i => i.kind === 'trailer').length, 2);
  assert.equal(new Set(result.data.map(i => i.id)).size, 4);
});
test('une panne des recommandations laisse les tendances et les autres sources accessibles', async () => {
  const request = async url => new Response(JSON.stringify(url === '/api/cinema-news' ? { items: [] } : { results: [{ id: 2, media_type: 'movie', title: 'Cold start', poster_path: '/a.jpg' }] }));
  const api = service(request, { './tmdb': { getTheatreReleases: async () => ({ thisWeek: [], upcoming: [] }), getRecommendations: async () => { throw Error('offline'); } } });
  const result = await api.getCinemaFil([{ tmdbId: 1, status: 'watched', title: 'Seed', ratings: {} }], [], 'fr');
  assert.ok(result.data.some(i => i.work?.tmdbId === 2));
});
test('les stockages personnels restent isolés par profil et les identifiants étrangers sont refusés', () => {
  const api = service(async () => new Response('{}'));
  assert.deepEqual(api.readFilLocal('no-storage'), { follows: [], liked: [] });
  assert.ok(!fil.validFilItemId('review:not-a-uuid'));
  assert.ok(!fil.validFilItemId('anything'));
  assert.ok(!fil.validFilItemId('trailer:movie:4:<script>'));
});

test('les séries restent présentes même après un grand nombre de films et le Fil reste limité à 60 cartes', () => {
  const movies = Array.from({ length: 80 }, (_, i) => ({ id: `movie-${i}`, mediaType: 'movie', kind: 'news', publishedAt: '2026-10-14T07:00:00Z' }));
  const series = { id: 'series', mediaType: 'tv', kind: 'news', publishedAt: '2026-10-13T07:00:00Z' };
  const other = movies.map(i => ({ ...i, id: `discovery-${i.id}`, kind: 'discovery' }));
  const result = fil.assembleFil([[...movies, series], other], new Set(), now);
  assert.equal(result.length, 60);
  assert.ok(result.some(i => i.id === 'series'));
});

test('les homonymes et remakes ne créent pas de lien arbitraire vers une fiche', () => {
  const news = { ...rss.parseCinemaRss(xml(item()), source, now)[0], title: 'Solaris revient au cinéma' };
  const works = [1, 2].map(tmdbId => ({ mediaType: 'movie', tmdbId, title: 'Solaris' }));
  assert.equal(fil.associateNews(news, works, new Set()).work, undefined);
});

test('une saison notée recommande sa série et une bande-annonce partage sa vidéo et sa vraie date', async () => {
  const calls = [];
  const request = async url => {
    calls.push(url);
    return new Response(JSON.stringify(url === '/api/cinema-news' ? { items: [] } : { results: url.includes('/recommendations') ? [{ id: 5, name: 'Another series', poster_path: '/s.jpg' }] : [] }));
  };
  const api = service(request, {
    './trailers': { bestVideo: async () => ({ key: 'abcdefghijk', kind: 'Trailer', publishedAt: '2026-09-01T10:00:00Z' }) },
  });
  const result = await api.getCinemaFil([{ tmdbId: 123456, seriesTmdbId: 95396, seasonNumber: 1, mediaType: 'tv', status: 'watched', title: 'Severance S1' }], [], 'fr');
  assert.ok(calls.some(url => url.includes('/tv/95396/recommendations')));
  assert.ok(!calls.some(url => url.includes('/tv/123456/')));
  const video = result.data.find(i => i.kind === 'trailer');
  assert.equal(video.sourceUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(video.publishedAt, '2026-09-01T10:00:00Z');
});
