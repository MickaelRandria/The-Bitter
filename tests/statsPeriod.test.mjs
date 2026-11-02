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

const { periodYears, periodMovies } = load('../utils/statsPeriod.ts');

const film = (id, y, status = 'watched') => ({ id, status, dateAdded: new Date(y, 5, 1).getTime() });
const movies = [
  ...[1, 2, 3, 4, 5, 6].map((i) => film(`a${i}`, 2026)),
  ...[1, 2, 3, 4, 5].map((i) => film(`b${i}`, 2025)),
  film('c1', 2024),
  film('w', 2024, 'watchlist'),
];

test('période : une année se propose à partir de 5 films vus', () => {
  assert.deepEqual(periodYears(movies), [2026, 2025]);
});

test('période : les films de l’année, ou tous', () => {
  assert.equal(periodMovies(movies, 2025).length, 5);
  assert.equal(periodMovies(movies, 'all').length, movies.length);
});
