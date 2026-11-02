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

const { computeAffinities } = load('../utils/affinities.ts');

const e = (key, personId, value, spaceName = 'Ciné') => ({ key, title: key, spaceName, personId, name: personId, value });
const entries = [
  // Jane : à 0,5 point de moi en moyenne.
  e('a', 'me', 8), e('a', 'jane', 8.5),
  e('b', 'me', 6), e('b', 'jane', 6.5),
  e('c', 'me', 9), e('c', 'jane', 9.5),
  // Marie : un gros désaccord sur « d ».
  e('a', 'marie', 6), e('b', 'marie', 6), e('d', 'me', 3), e('d', 'marie', 8.5),
  // Lala : un seul film commun, elle ne compte pas.
  e('a', 'lala', 2),
  // Le même film noté dans deux espaces : une seule note, la moyenne.
  e('c', 'me', 9, 'Famille'),
];

test('affinités : l’accord vaut 100 moins dix fois l’écart moyen', () => {
  const { friends } = computeAffinities('me', entries);
  assert.deepEqual(friends.map((f) => f.personId), ['jane', 'marie']);
  assert.equal(friends[0].score, 95);
  assert.equal(friends[0].common, 3);
  assert.ok(friends[0].generosity > 0);
});

test('affinités : le film qui divise, et ceux où l’on s’accorde', () => {
  const { divider, agreed } = computeAffinities('me', entries);
  assert.equal(divider.key, 'd');
  assert.equal(divider.friend.id, 'marie');
  assert.deepEqual(agreed.map((f) => f.key), ['c', 'a']);
});
