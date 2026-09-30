import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/tv.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { groupWatchOffers, hasNetflix } = load('../utils/watchOffers.ts');

const p = (provider_id, provider_name) => ({ provider_id, provider_name, logo_path: `/${provider_id}.png` });

test('a film only for rent or sale still lists where to watch it', () => {
  // Oppenheimer en France, relevé le 30 septembre 2026 (extrait).
  const offers = groupWatchOffers({
    rent: [p(2, 'Apple TV Store'), p(10, 'Amazon Video'), p(1754, 'TF1+')],
    buy: [p(2, 'Apple TV Store'), p(10, 'Amazon Video'), p(2671, 'ARTE Boutique')],
  });
  assert.deepEqual(offers.streaming, []);
  assert.deepEqual(
    offers.transactional.map((o) => [o.name, o.access]),
    [
      ['Apple TV Store', 'rentOrBuy'],
      ['Amazon Video', 'rentOrBuy'],
      ['TF1+', 'rent'],
      ['ARTE Boutique', 'buy'],
    ]
  );
});

test('a platform appears once, with the offer that costs the viewer least', () => {
  // « Le Mécano de la General » : TF1+ en abonnement et gratuit avec pub, Arte gratuit.
  const offers = groupWatchOffers({
    flatrate: [p(1754, 'TF1+'), p(2626, 'Artiflix')],
    free: [p(234, 'Arte')],
    ads: [p(1754, 'TF1+'), p(538, 'Plex')],
  });
  assert.deepEqual(
    offers.streaming.map((o) => [o.name, o.access]),
    [
      ['TF1+', 'ads'],
      ['Artiflix', 'subscription'],
      ['Arte', 'free'],
      ['Plex', 'ads'],
    ]
  );
});

test('renting is not offered on a platform the viewer can already stream', () => {
  // Whiplash : LaCinetek en abonnement, en location et à l'achat.
  const offers = groupWatchOffers({
    flatrate: [p(310, 'LaCinetek')],
    rent: [p(310, 'LaCinetek'), p(2, 'Apple TV Store')],
    buy: [p(310, 'LaCinetek')],
  });
  assert.deepEqual(
    offers.streaming.map((o) => o.name),
    ['LaCinetek']
  );
  assert.deepEqual(
    offers.transactional.map((o) => o.name),
    ['Apple TV Store']
  );
});

test('no data for France means no offers', () => {
  assert.deepEqual(groupWatchOffers(undefined), { streaming: [], transactional: [] });
  assert.deepEqual(groupWatchOffers({ link: 'https://www.themoviedb.org/movie/1/watch' }), {
    streaming: [],
    transactional: [],
  });
});

test('Netflix counts with or without ads, but not for rent', () => {
  assert.equal(hasNetflix(groupWatchOffers({ flatrate: [p(8, 'Netflix')] })), true);
  assert.equal(
    hasNetflix(groupWatchOffers({ flatrate: [p(1796, 'Netflix Standard with Ads')] })),
    true
  );
  assert.equal(hasNetflix(groupWatchOffers({ flatrate: [p(337, 'Disney Plus')] })), false);
  assert.equal(hasNetflix(groupWatchOffers({ rent: [p(8, 'Netflix')] })), false);
});
