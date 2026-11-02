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

const { cinemaStats, formatLabels, goalProgress } = load('../utils/cinemaStats.ts');

test('salles : les cinémas par séances, la meilleure moyenne, les versions', () => {
  const ratings = new Map([[1, 8], [2, 6], [3, 9], [4, 7]]);
  const report = cinemaStats(
    [
      { startsAt: 1, cinemaName: 'UGC Rosny', format: 'VOST', tmdbId: 1 },
      { startsAt: 2, cinemaName: 'UGC Rosny', format: 'VF', tmdbId: 2 },
      { startsAt: 3, cinemaName: 'UGC Rosny', format: 'IMAX VOST' },
      { startsAt: 4, cinemaName: 'Le Champo', format: 'VO', tmdbId: 3 },
      { startsAt: 5, cinemaName: 'Le Champo', tmdbId: 4 },
    ],
    (id) => ratings.get(id)
  );
  assert.equal(report.sessions, 5);
  assert.deepEqual(report.cinemas.map((c) => [c.name, c.count]), [['UGC Rosny', 3], ['Le Champo', 2]]);
  assert.equal(report.best.name, 'Le Champo');
  assert.deepEqual(report.formats[0], { label: 'VOST', count: 3 });
  assert.deepEqual(formatLabels('IMAX VOST'), ['VOST', 'IMAX']);
});

test('objectif : l’avance sur le rythme et la projection', () => {
  // Au 1er juillet (mi-année), 60 films pour un objectif de 100 : 10 d'avance environ.
  const p = goalProgress(60, 100, new Date(2026, 6, 2));
  assert.ok(p.ahead >= 9 && p.ahead <= 11, String(p.ahead));
  assert.ok(p.projection >= 118 && p.projection <= 121, String(p.projection));
  assert.equal(p.left, 40);
});
