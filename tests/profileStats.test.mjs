import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Onglet Profil des statistiques : signature, podium, année. */
function load(relative, deps = {}) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => {
    if (deps[name]) return deps[name];
    throw new Error(`Dépendance inattendue : ${name}`);
  });
  return exports;
}
const verdict = load('../utils/verdict.ts');
const { signatureOf, podiumOf, yearOf } = load('../utils/profileStats.ts', { './verdict': verdict });

const flat = (v) => ({ ratings: { story: v, visuals: v, acting: v, sound: v } });
const grid = (scenario, image, interpretation, sound) => ({
  ratings: { story: 7, visuals: 7, acting: 7, sound: 7 },
  adaptiveRating: { criteria: [
    { key: 'scenario', value: scenario }, { key: 'image', value: image },
    { key: 'interpretation', value: interpretation }, { key: 'sound', value: sound },
  ] },
});

test('signature : les notes plates recopiées ne comptent pas', () => {
  assert.equal(signatureOf([flat(7), flat(8), flat(6), flat(9)]), null);
});

test('signature : la grille Bitter+ passe avant les colonnes, le critère le plus bas ressort', () => {
  const s = signatureOf([grid(8, 7, 7, 5), grid(9, 8, 7, 6), grid(7, 7, 8, 5), flat(4)]);
  assert.equal(s.count, 3);
  assert.equal(s.values.story, 8);
  assert.deepEqual(s.order, ['story', 'visuals', 'acting', 'sound']);
  assert.equal(s.harshest.key, 'sound');
  assert.ok(s.harshest.gap < -1.5);
});

test('podium : les trois meilleurs, le plus récent à égalité', () => {
  const films = [{ id: 'a', s: 8, d: 1 }, { id: 'b', s: 9, d: 1 }, { id: 'c', s: 8, d: 5 }, { id: 'd', s: 7, d: 9 }, { id: 'e', s: 0, d: 9 }];
  assert.deepEqual(podiumOf(films, (f) => f.s, (f) => f.d).map((f) => f.id), ['b', 'c', 'a']);
});

test('année : mois record, le plus récent à égalité, et rythme par semaine', () => {
  assert.deepEqual(yearOf(new Array(12).fill(0)), { total: 0, record: null, recordCount: 0, perWeek: 0 });
  const y = yearOf([0, 2, 7, 1, 0, 7, 3, 0, 0, 0, 0, 1]);
  assert.equal(y.total, 21);
  assert.equal(y.record, 5);
  assert.equal(y.perWeek, 1.5);
});
