import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Onglet Goûts : genres, treemap, avis contraires, réalisateurs, époques, notes, attente. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => { throw new Error('dépendance'); });
  return exports;
}
const g = load('../utils/goutsStats.ts');
const f = (i, o) => ({ id: `f${i}`, title: `Film ${i}`, score: 7, ...o });

test('genres : les principaux, le reste dans « Autres »', () => {
  const films = [
    ...Array.from({ length: 6 }, (_, i) => f(i, { genre: 'Drame', score: 8 })),
    ...Array.from({ length: 4 }, (_, i) => f(10 + i, { genre: 'Action', score: 6 })),
    f(20, { genre: 'Horreur' }),
    f(21, { genre: 'Romance, Drame', score: 9 }),
  ];
  const blocks = g.genreBlocks(films, 2);
  assert.deepEqual(blocks.map((b) => b.name), ['Drame', 'Action', 'Autres']);
  assert.equal(blocks[2].count, 2);
  assert.equal(blocks[2].others, true);
});

test('treemap : surfaces proportionnelles, dans le cadre', () => {
  const tiles = g.squarify([24, 14, 13, 11, 9, 14]);
  const total = 24 + 14 + 13 + 11 + 9 + 14;
  for (const t of tiles) {
    const v = [24, 14, 13, 11, 9, 14][t.index];
    assert.ok(Math.abs(t.w * t.h - (v / total) * 10000) < 0.01);
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 100 + 1e-9 && t.y + t.h <= 100 + 1e-9);
  }
});

test('avis contraires : seulement au-delà de 0,5 point', () => {
  const r = g.contrarian([f(1, { score: 9, publicScore: 7.8 }), f(2, { score: 6, publicScore: 8.1 }), f(3, { score: 7, publicScore: 7.2 })]);
  assert.equal(r.surprise.id, 'f1');
  assert.equal(r.disappointment.id, 'f2');
  assert.equal(g.contrarian([f(1, { score: 7, publicScore: 7.2 })]).surprise, undefined);
});

test('réalisateurs, époques, répartition, attente', () => {
  const films = [
    ...[1, 2, 3].map((i) => f(i, { director: 'A', score: 9, year: 2001 })),
    ...[4, 5].map((i) => f(i, { director: 'B', score: 8, year: 1995 })),
    f(6, { score: 6, year: 2023, hype: 9 }), f(7, { score: 8, year: 2021, hype: 5 }), f(8, { score: 7, year: 2020, hype: 7 }),
  ];
  assert.deepEqual(g.topDirectors(films).map((d) => d.name), ['A']);
  assert.deepEqual(g.decades(films).map((d) => d.decade), [1990, 2000, 2020]);
  const dist = g.distribution(films);
  assert.equal(dist.total, 8);
  assert.equal(dist.nines, 3);
  const hype = g.hypeGaps(films);
  assert.equal(hype[0].id, 'f6');
  assert.equal(hype.length, 2);
});
