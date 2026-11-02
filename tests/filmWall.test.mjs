import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Transpile et exécute le module livré, comme `tests/whoRated.test.mjs`. La
 * note d'un film vient de utils/movieDisplay : ici, directement le champ `n`.
 */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const stubs = { './movieDisplay': { getMovieDisplayRating: (m) => m.n } };
  new Function('exports', 'require', compiled)(exports, (name) => stubs[name] ?? {});
  return exports;
}

const { activePin, choicesOf, heroOf, monthKey, sectionsOf, statsOf } = load('../utils/filmWall.ts');

const at = (y, m, d) => new Date(y, m - 1, d, 20).getTime();
const film = (id, n, when, genre = 'Drame', year = 2020) => ({ id, title: id, n, dateAdded: when, dateWatched: when, genre, year });
const movies = [
  film('hope', 8, at(2026, 11, 1), 'Science-fiction', 2026),
  film('exmachina', 8.5, at(2026, 10, 29), 'Science-fiction', 2015),
  film('karma', 6.5, at(2026, 10, 25), 'Thriller', 2026),
  film('hg', 9, at(2026, 10, 12), 'Action', 2012),
  film('old', 9.5, at(2025, 3, 2), 'Drame', 1999),
];

test('mur : le film du mois, épinglé jusqu’à la fin du mois seulement', () => {
  assert.equal(heroOf(movies, 'recent', null, null).film.id, 'hope');
  const pin = { mode: 'pick', movieId: 'hg', month: '2026-11' };
  assert.equal(heroOf(movies, 'recent', pin, null).film.id, 'hg');
  assert.equal(activePin(pin, at(2026, 11, 30)), pin);
  assert.equal(activePin(pin, at(2026, 12, 1)), null);
  assert.equal(heroOf(movies, 'recent', { mode: 'ever', month: '2026-11' }, null).film.id, 'old');
});

test('mur : le film en grand ne revient pas dans la mosaïque, les mois se suivent', () => {
  const sections = sectionsOf(movies, 'recent', null, 'hope');
  assert.deepEqual(sections.map((s) => s.key), ['2026-10', '2025-03']);
  assert.deepEqual(sections[0].films.map((m) => m.id), ['exmachina', 'karma', 'hg']);
  assert.equal(monthKey(at(2026, 11, 1)), '2026-11');
});

test('mur : mieux notés par tranches, genre avec son meilleur film', () => {
  const top = sectionsOf(movies, 'top', null, 'old');
  assert.deepEqual(top.map((s) => s.key), ['9', '8', '6']);
  assert.equal(statsOf(movies, 'top', '9').count, 2);
  assert.deepEqual(choicesOf(movies, 'genre')[0], { value: 'Science-fiction', count: 2 });
  assert.equal(heroOf(movies, 'genre', null, 'Science-fiction').film.id, 'exmachina');
  assert.deepEqual(sectionsOf(movies, 'genre', 'Science-fiction', 'exmachina')[0].films.map((m) => m.id), ['hope']);
  assert.equal(choicesOf(movies, 'year')[0].value, '2026');
});
