import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { hotPicks, unreviewed, searchCollection, rankRemote, splitSequel, hasSequelNumber, editDistance, personMatches, normalize } =
  load('../utils/filmPicker.ts');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 8, 12);
const rated = { story: 8, visuals: 9, acting: 8, sound: 9 };
const unratedR = { story: 0, visuals: 0, acting: 0, sound: 0 };
const film = (id, extra = {}) => ({
  id, title: id, director: '', actors: '', year: 2024, genre: 'Drame', ratings: rated, review: '',
  dateAdded: NOW - 100 * DAY, theme: 'black', status: 'watched', mediaType: 'movie', ...extra,
});

test('normalize retire accents et ponctuation', () => {
  assert.equal(normalize('Dune : Deuxième partie'), 'dune deuxieme partie');
  assert.equal(normalize("L'Été dernier"), 'l ete dernier');
});

test('À chaud : sans avis d’abord, puis le plus récent, séances non notées comprises', () => {
  const movies = [
    film('Dune', { tmdbId: 1, dateWatched: NOW - 1 * DAY }),
    film('Avec avis', { tmdbId: 2, dateWatched: NOW - 0.5 * DAY, review: 'Super' }),
    film('Vieux', { tmdbId: 3, dateWatched: NOW - 20 * DAY }),
    film('Saison', { tmdbId: 4, dateWatched: NOW - DAY, mediaType: 'tv', seasonNumber: 1 }),
  ];
  const due = [
    { id: 's1', tmdbId: 9, title: 'Anora', startsAt: NOW - 2 * DAY },
    { id: 's2', tmdbId: 1, title: 'Dune', startsAt: NOW - DAY },
  ];
  const picks = hotPicks(movies, due, 'movie', NOW);
  assert.deepEqual(picks.map((p) => (p.kind === 'movie' ? p.movie.id : p.screening.id)), ['Dune', 's1', 'Avec avis']);
  assert.equal(hotPicks(movies, due, 'tv', NOW).length, 0);
});

test('Notés, sans avis : exclut les avis écrits, les non notés et « À chaud »', () => {
  const movies = [
    film('A', { dateWatched: NOW - 3 * DAY }),
    film('B', { dateWatched: NOW - 30 * DAY }),
    film('C', { review: 'déjà dit' }),
    film('D', { ratings: unratedR }),
    film('E', { status: 'watchlist' }),
  ];
  const { items, total } = unreviewed(movies, 'movie', new Set(['A']));
  assert.deepEqual(items.map((m) => m.id), ['B']);
  assert.equal(total, 1);
});

test('suites : « dune 2 » et ses formes', () => {
  assert.deepEqual(splitSequel('Dune 2'), { base: 'dune', sequel: 2 });
  assert.deepEqual(splitSequel('1917'), { base: '1917', sequel: null });
  assert.deepEqual(splitSequel('ocean 11'), { base: 'ocean 11', sequel: null });
  assert.ok(hasSequelNumber('Dune : Deuxième partie', 2));
  assert.ok(hasSequelNumber('Rocky II', 2));
  assert.ok(hasSequelNumber('Dune: Part Two', 2));
  assert.ok(!hasSequelNumber('Dune', 2));
});

test('fautes de frappe', () => {
  assert.equal(editDistance('parasit', 'parasite'), 1);
  assert.equal(editDistance('oppenhiemer', 'oppenheimer'), 1);
  assert.ok(editDistance('dune', 'anora', 1) > 1);
});

test('recherche dans la collection : titre, faute, réalisateur, acteur, suite', () => {
  const movies = [
    film('Dune', { title: 'Dune', director: 'Denis Villeneuve', year: 2021 }),
    film('Dune2', { title: 'Dune : Deuxième partie', director: 'Denis Villeneuve', actors: 'Timothée Chalamet, Zendaya' }),
    film('Parasite', { title: 'Parasite', director: 'Bong Joon-ho', year: 2019 }),
    film('Saison', { title: 'Dune Prophecy', mediaType: 'tv', seasonNumber: 1 }),
  ];
  assert.equal(searchCollection(movies, 'parasit', 'movie')[0].movie.id, 'Parasite');
  assert.equal(searchCollection(movies, 'dune 2', 'movie')[0].movie.id, 'Dune2');
  const byDirector = searchCollection(movies, 'villeneuve', 'movie');
  assert.deepEqual(byDirector.map((m) => m.reason), ['director', 'director']);
  assert.equal(searchCollection(movies, 'zendaya', 'movie')[0].reason, 'actor');
  assert.equal(searchCollection(movies, 'dune 2021', 'movie')[0].movie.id, 'Dune');
  assert.equal(searchCollection(movies, 'd', 'movie').length, 0);
  assert.ok(!searchCollection(movies, 'prophecy', 'movie').length);
});

test('résultats TMDB : la suite demandée d’abord, sans doublon ni film déjà possédé', () => {
  const remote = [
    { id: 1, title: 'Dune' },
    { id: 2, title: 'Dune : Deuxième partie' },
    { id: 2, title: 'Dune : Deuxième partie' },
    { id: 3, title: 'Dune (1984)' },
    { id: 4, title: 'Le Temps d’une tartine 2' },
    { id: 5, title: 'Dune: Part Two', originalTitle: 'Dune: Part Two' },
  ];
  assert.deepEqual(rankRemote(remote, 'dune 2', new Set([3])).map((r) => r.id), [2, 5, 1]);
  assert.deepEqual(rankRemote(remote, '', new Set()).map((r) => r.id), [1, 2, 3, 4, 5]);
});

test('une personne ne vaut filmographie que si son nom répond', () => {
  assert.ok(personMatches('Denis Villeneuve', 'villeneuve'));
  assert.ok(personMatches('Denis Villeneuve', 'villneuve'));
  assert.ok(!personMatches('Dune Smith', 'dune 2'));
});
