import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/upNext.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const nav = load('../utils/navActions.ts');
const ctx = (extra) => ({ page: 'Feed', feedTab: 'history', mediaMode: 'movie', statsUnlocked: true, ...extra });

test('le + suit la page côté films', () => {
  assert.equal(nav.primaryActionFor(ctx()), 'addWatched');
  assert.equal(nav.primaryActionFor(ctx({ feedTab: 'queue' })), 'addWatchlist');
  assert.equal(nav.primaryActionFor(ctx({ page: 'Discover' })), 'addWatched');
  assert.equal(nav.primaryActionFor(ctx({ page: 'Calendar' })), 'plan');
  assert.equal(nav.primaryActionFor(ctx({ page: 'Analytics' })), 'shareCard');
  assert.equal(nav.primaryActionFor(ctx({ page: 'Deck' })), 'addWatched');
});

test('sans carte à partager, le + des stats ajoute un film vu', () => {
  assert.equal(nav.primaryActionFor(ctx({ page: 'Analytics', statsUnlocked: false })), 'addWatched');
});

test('côté séries, le + commence une série partout sauf dans un espace', () => {
  for (const page of ['Feed', 'Discover', 'Calendar', 'Analytics']) {
    assert.equal(nav.primaryActionFor(ctx({ page, mediaMode: 'tv' })), 'startSeries');
  }
  assert.equal(nav.primaryActionFor(ctx({ page: 'SharedSpace', mediaMode: 'tv' })), 'propose');
  assert.equal(nav.primaryActionFor(ctx({ page: 'SharedSpace' })), 'propose');
});

test('chaque action a son libellé', () => {
  assert.equal(nav.primaryLabelKey('plan'), 'nav.primary.plan');
});

test('le menu d’ajout dépend de la partie et de l’espace', () => {
  assert.deepEqual(nav.addMenuFor('movie', false), ['watched', 'watchlist', 'series', 'ticket', 'dictate']);
  assert.deepEqual(nav.addMenuFor('tv', false), ['series', 'watched', 'watchlist', 'movie', 'ticket', 'dictate']);
  assert.deepEqual(nav.addMenuFor('movie', true), ['watchlist', 'watched', 'dictate']);
  assert.equal(nav.addMenuLabelKey('watched', 'movie'), 'nav.add.watched');
  assert.equal(nav.addMenuLabelKey('watched', 'tv'), 'nav.add.tv.watched');
  assert.equal(nav.addMenuLabelKey('series', 'tv'), 'nav.add.tv.series');
  assert.equal(nav.addMenuLabelKey('series', 'movie'), 'nav.add.series');
  assert.equal(nav.addMenuLabelKey('ticket', 'tv'), 'nav.add.ticket');
});

test('la découverte relue du stockage ne lève jamais', () => {
  assert.deepEqual(nav.parseDiscovery(null), nav.EMPTY_DISCOVERY);
  assert.deepEqual(nav.parseDiscovery('pas du json'), nav.EMPTY_DISCOVERY);
  assert.deepEqual(nav.parseDiscovery('null'), nav.EMPTY_DISCOVERY);
  assert.deepEqual(nav.parseDiscovery('{"learned":"oui","taps":-3,"labelShows":2.7}'), {
    ...nav.EMPTY_DISCOVERY,
    labelShows: 2,
  });
  assert.equal(nav.parseDiscovery('{"learned":true}').learned, true);
});

test('l’éventail ne se joue qu’une fois, jamais pendant une visite', () => {
  const fresh = nav.EMPTY_DISCOVERY;
  assert.equal(nav.shouldRunFan(fresh, false), true);
  assert.equal(nav.shouldRunFan(fresh, true), false);
  assert.equal(nav.shouldRunFan({ ...fresh, fanSeen: true }, false), false);
  assert.equal(nav.shouldRunFan({ ...fresh, learned: true }, false), false);
});

test('l’astuce arrive au 3e appui court et pas avant', () => {
  let state = nav.EMPTY_DISCOVERY;
  state = nav.recordTap(state);
  state = nav.recordTap(state);
  assert.equal(nav.shouldOfferHoldTip(state), false);
  state = nav.recordTap(state);
  assert.equal(state.taps, 3);
  assert.equal(nav.shouldOfferHoldTip(state), true);
  assert.equal(nav.shouldOfferHoldTip({ ...state, tipSeen: true }), false);
  assert.equal(nav.shouldOfferHoldTip({ ...state, learned: true }), false);
});

test('le compteur s’arrête quand il ne sert plus', () => {
  const learned = { ...nav.EMPTY_DISCOVERY, learned: true, taps: 1 };
  assert.equal(nav.recordTap(learned), learned);
  const seen = { ...nav.EMPTY_DISCOVERY, tipSeen: true, taps: 4 };
  assert.equal(nav.recordTap(seen), seen);
});

test('la bulle d’action s’arrête après quelques changements de page', () => {
  assert.equal(nav.shouldShowPageLabel({ ...nav.EMPTY_DISCOVERY, labelShows: nav.PAGE_LABEL_SHOWS - 1 }), true);
  assert.equal(nav.shouldShowPageLabel({ ...nav.EMPTY_DISCOVERY, labelShows: nav.PAGE_LABEL_SHOWS }), false);
});

const work = (key, extra) => ({ key, tmdbId: 1, mediaType: 'movie', title: key, source: 'discover', ...extra });

test('cocher deux fois retire de la sélection', () => {
  const a = work('a');
  const b = work('b');
  let items = nav.toggleWork([], a);
  items = nav.toggleWork(items, b);
  assert.deepEqual(items.map((w) => w.key), ['a', 'b']);
  items = nav.toggleWork(items, { ...a });
  assert.deepEqual(items.map((w) => w.key), ['b']);
});

test('les clés Découvrir rejoignent celles de la collection', () => {
  assert.equal(nav.tmdbWorkKey('movie', 603), 'movie:603:');
  assert.equal(nav.tmdbWorkKey('tv', 1396), 'tv:1396:');
});

test('noter et voir avec ne valent que pour un seul titre', () => {
  const one = nav.selectionActionsFor([work('a')], [null], true);
  assert.deepEqual(one, { rate: true, watchlist: true, watchWith: true, share: true });
  const two = nav.selectionActionsFor([work('a'), work('b')], [null, null], true);
  assert.equal(two.rate, false);
  assert.equal(two.watchWith, false);
  assert.equal(two.watchlist, true);
});

test('à voir disparaît quand tout est déjà dans la collection', () => {
  const actions = nav.selectionActionsFor([work('a'), work('b')], ['watched', 'watchlist'], true);
  assert.equal(actions.watchlist, false);
  assert.equal(nav.selectionActionsFor([work('a'), work('b')], ['watched', null], true).watchlist, true);
});

test('voir avec demande un compte, et une série doit être dans la collection', () => {
  assert.equal(nav.selectionActionsFor([work('a')], [null], false).watchWith, false);
  assert.equal(nav.selectionActionsFor([work('s', { mediaType: 'tv' })], [null], true).watchWith, false);
  assert.equal(nav.selectionActionsFor([work('s', { mediaType: 'tv' })], ['watchlist'], true).watchWith, true);
});

test('un titre d’espace sans référence TMDB se note quand même dans l’espace', () => {
  const spaceOnly = work('space:1', { tmdbId: undefined, source: 'space', spaceMovie: { id: '1' } });
  const actions = nav.selectionActionsFor([spaceOnly], [null], true);
  assert.equal(actions.rate, true);
  assert.equal(actions.watchlist, false);
  assert.equal(actions.watchWith, false);
});

test('le partage liste les titres avec leur année', () => {
  assert.deepEqual(nav.selectionShareLines([work('Anora', { year: 2024 }), work('Sirāt')]), ['Anora (2024)', 'Sirāt']);
});
