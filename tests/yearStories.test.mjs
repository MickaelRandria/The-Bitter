import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Affiches « Mon année » : le film de l'année, la révélation, le navet. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => {
    throw new Error('Le module doit rester sans import');
  });
  return exports;
}
const { yearStories, shortQuote, formatRuntime, topCriteria } = load('../utils/yearStories.ts');

const crit = (story, visuals, acting, sound) => ({ story, visuals, acting, sound });
const film = (id, score, extra = {}) => ({ id, title: id, score, criteria: null, days: ['2026-03-01'], runtime: 120, ...extra });

test('le film de l’année est le mieux noté, à égalité le plus récent', () => {
  const r = yearStories([
    film('a', 8, { days: ['2026-01-02'] }),
    film('b', 9, { days: ['2026-02-02'] }),
    film('c', 9, { days: ['2026-05-02'] }),
    film('d', 4),
  ]);
  assert.equal(r.best.id, 'c');
  assert.deepEqual(r.casting.map((f) => f.id), ['b', 'a', 'd']);
  assert.equal(r.worst.id, 'd');
  assert.equal(r.count, 4);
});

test('les revisionnages comptent dans les heures, pas dans le nombre de films', () => {
  const r = yearStories([film('a', 8, { runtime: 90, days: ['2026-01-01', '2026-06-01'] }), film('b', 7, { runtime: 60 })]);
  assert.equal(r.count, 2);
  assert.equal(r.viewings, 3);
  assert.equal(r.hours, 4);
});

test('un film sans note ou sans séance dans l’année est ignoré', () => {
  const r = yearStories([film('a', 0), film('b', 7, { days: [] }), film('c', 6)]);
  assert.equal(r.count, 1);
  assert.equal(r.worst, null, 'pas de pire soirée avec un seul film');
});

test('le critère fétiche dépasse la moyenne des quatre, il faut trois films détaillés', () => {
  const two = yearStories([film('a', 8, { criteria: crit(7, 7, 7, 9) }), film('b', 8, { criteria: crit(7, 7, 7, 9) })]);
  assert.equal(two.signature, null);
  const three = yearStories([
    film('a', 8, { criteria: crit(7, 7, 7, 9) }),
    film('b', 8, { criteria: crit(7, 7, 7, 9) }),
    film('c', 8, { criteria: crit(7, 7, 7, 9) }),
  ]);
  assert.equal(three.signature.key, 'sound');
  assert.equal(Number(three.signature.gap.toFixed(2)), 1.5);
});

test('la révélation dépasse l’attente d’au moins un point, la plus grande d’abord', () => {
  const r = yearStories([
    film('a', 8.3, { hype: 5.1 }),
    film('b', 7, { hype: 6.5 }),
    film('c', 9, { hype: 7.6 }),
    film('d', 4, { hype: 8 }),
  ]);
  assert.deepEqual(r.surprises.map((s) => s.film.id), ['a', 'c']);
  assert.equal(Number(r.surprises[0].gap.toFixed(1)), 3.2);
});

test('pas de navet au-dessus de 5', () => {
  assert.equal(yearStories([film('a', 8), film('b', 5.4)]).navet, null);
  assert.equal(yearStories([film('a', 8), film('b', 2.1)]).navet.id, 'b');
});

test('la citation garde la première phrase, coupée sur un mot', () => {
  assert.equal(shortQuote('J’ai regardé l’heure onze fois. Puis je suis parti.'), 'J’ai regardé l’heure onze fois');
  assert.equal(shortQuote('   '), null);
  const long = shortQuote('Une mise en scène tellement paresseuse que même les figurants semblent attendre la fin');
  assert.ok(long.length <= 47 && long.endsWith('…'));
  assert.ok(!long.includes('  '));
});

test('durées et critères', () => {
  assert.equal(formatRuntime(116), '1 h 56');
  assert.equal(formatRuntime(120), '2 h');
  assert.equal(formatRuntime(48), '48 min');
  assert.deepEqual(topCriteria(crit(8, 9.5, 6, 7)).map((c) => c.key), ['visuals', 'story', 'sound', 'acting']);
  assert.deepEqual(topCriteria(null), []);
});
