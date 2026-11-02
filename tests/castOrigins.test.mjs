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

const { parseActors, topActors, topCountries, bestOf, rankingCsv } = load('../utils/castOrigins.ts');

test('acteurs : les premiers rôles seulement, à partir de 3 films', () => {
  assert.deepEqual(parseActors('A, B, C, D, E'), ['A', 'B', 'C', 'D']);
  const films = [
    { id: '1', score: 8, actors: ['Pugh', 'X'] },
    { id: '2', score: 7, actors: ['Pugh'] },
    { id: '3', score: 9, actors: ['Pugh', 'X'] },
    { id: '4', score: 5, actors: ['X'] },
  ];
  const actors = topActors(films);
  assert.deepEqual(actors.map((a) => [a.key, a.count]), [['Pugh', 3], ['X', 3]]);
  assert.equal(actors[0].average, 8);
});

test('pays : un film coproduit compte pour chaque pays, une fois', () => {
  const films = [
    { id: '1', score: 8, actors: [], countries: ['US', 'GB', 'US'] },
    { id: '2', score: 6, actors: [], countries: ['US'] },
    { id: '3', score: 9, actors: [], countries: ['KR'] },
  ];
  assert.deepEqual(topCountries(films).map((c) => [c.key, c.count]), [['US', 2], ['KR', 1], ['GB', 1]]);
  assert.equal(bestOf(topCountries(films), 1).key, 'KR');
});

test('export : un CSV importable, la note sur 5 en demi-étoiles', () => {
  const csv = rankingCsv([{ tmdbId: 9, title: 'Hope, le film', year: 2026, score: 8.6, watchedAt: Date.UTC(2026, 10, 1) }]);
  const [head, row] = csv.trim().split('\n');
  assert.equal(head, 'Position,tmdbID,Title,Year,Rating10,Rating,WatchedDate');
  assert.equal(row, '1,9,"Hope, le film",2026,8.6,4.5,2026-11-01');
});

test('pays : le pays d’origine, pas les coproducteurs', () => {
  const { originCountries } = (() => {
    const url = new URL('../services/movieOrigins.ts', import.meta.url);
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function('exports', 'require', compiled)(exports, () => ({ TMDB_API_KEY: '', TMDB_BASE_URL: '' }));
    return exports;
  })();
  assert.deepEqual(originCountries({ origin_country: ['US'], production_countries: [{ iso_3166_1: 'US' }, { iso_3166_1: 'DE' }] }), ['US']);
  assert.deepEqual(originCountries({ production_countries: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'BE' }] }), ['FR']);
  assert.deepEqual(originCountries({}), []);
});
