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

const { computeConstats, MIN_PUBLIC } = load('../utils/constats.ts');

/** Un film type ; chaque test ne surcharge que ce qu'il regarde. */
const film = (i, over = {}) => ({ id: `f${i}`, title: `Film ${i}`, rating: 6, ...over });
const many = (n, make) => Array.from({ length: n }, (_, i) => film(i, make(i)));

test('toi vs le public : verrouillé sous le seuil, avec ce qu’il manque', () => {
  const c = computeConstats(many(MIN_PUBLIC - 3, () => ({ publicRating: 7 })));
  assert.equal(c.public.unlocked, false);
  assert.equal(c.public.missing, 3);
});

test('toi vs le public : la phrase suit le sens de l’écart', () => {
  const below = computeConstats(many(12, () => ({ rating: 5.5, publicRating: 7 }))).public;
  assert.equal(below.tone, 'below');
  assert.ok(Math.abs(below.gap + 1.5) < 1e-9);
  const above = computeConstats(many(12, () => ({ rating: 8, publicRating: 7 }))).public;
  assert.equal(above.tone, 'above');
  const same = computeConstats(many(12, () => ({ rating: 7.1, publicRating: 7 }))).public;
  assert.equal(same.tone, 'same');
});

test('toi vs le public : le genre n’est cité que s’il accentue le trait', () => {
  const films = [
    ...many(8, () => ({ rating: 6.5, publicRating: 7, genre: 'Drame' })),
    ...many(6, (i) => ({ id: `c${i}`, rating: 4.5, publicRating: 7, genre: 'Comédie' })),
  ];
  const k = computeConstats(films).public;
  assert.equal(k.genre.name, 'Comédie');
});

test('le test du téléphone : il faut deux groupes comparables', () => {
  const allZero = computeConstats(many(15, () => ({ phone: 0 }))).phone;
  assert.equal(allZero.unlocked, false);
  const films = [...many(8, () => ({ phone: 0, rating: 7.5 })), ...many(6, (i) => ({ id: `p${i}`, phone: 60, rating: 4.5 }))];
  const k = computeConstats(films).phone;
  assert.equal(k.unlocked, true);
  assert.equal(k.tone, 'strong');
});

test('le maillon faible : ignore les notes identiques partout, partage les ex æquo', () => {
  const films = [
    ...many(15, () => ({ criteria: [4, 7, 7, 7] })),
    ...many(5, (i) => ({ id: `u${i}`, criteria: [6, 6, 6, 6] })),
    film('tie', { criteria: [5, 5, 8, 8] }),
  ];
  const k = computeConstats(films).maillon;
  assert.equal(k.lead, 'scenario');
  assert.equal(k.total, 16);
  assert.equal(k.weakest.scenario, 15.5);
  assert.equal(k.weakest.image, 0.5);
});

test('la frontière émotionnelle : des empreintes de part et d’autre de la moyenne', () => {
  const films = [
    ...many(4, () => ({ rating: 8, imprints: ['wonder', 'emotion'] })),
    ...many(4, (i) => ({ id: `b${i}`, rating: 4, imprints: ['malaise', 'disappointment'] })),
  ];
  const k = computeConstats(films).emotions;
  assert.equal(k.unlocked, true);
  assert.equal(k.split, 6);
  assert.ok(['wonder', 'emotion'].includes(k.top.key));
  assert.ok(['malaise', 'disappointment'].includes(k.low.key));
});

test('la durée et les classiques : verrouillés sans groupes aux deux bouts', () => {
  const c = computeConstats(many(20, () => ({ runtime: 110, year: 2026, watchedYear: 2026 })));
  assert.equal(c.duree.unlocked, false);
  assert.equal(c.classiques.unlocked, false);
});

test('les revirements : du plus net au plus léger', () => {
  const films = [film(1, { rating: 7, firstRating: 7.5 }), film(2, { rating: 4, firstRating: 8 }), film(3, { rating: 6 })];
  const k = computeConstats(films).revirements;
  assert.deepEqual(k.changes.map((c) => c.id), ['f2', 'f1']);
  assert.equal(computeConstats([film(1)]).revirements.unlocked, false);
});
