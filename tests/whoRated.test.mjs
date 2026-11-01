import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Transpile et exécute le module livré, comme `tests/blindTest.test.mjs`. La
 * note d'un membre vient de utils/verdict : ici, directement le champ `v`.
 */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const stubs = { '../utils/verdict': { ratingValue: (r) => r.v } };
  new Function('exports', 'require', compiled)(exports, (name) => stubs[name] ?? {});
  return exports;
}

const { buildWhoQuestions, isWhoRight, memberTastes, whoCandidates } = load('../services/whoRated.ts');

const people = [{ id: 'me' }, { id: 'jane' }, { id: 'marie' }, { id: 'lala' }];
const movies = [{ id: 'a', title: 'Aftersun' }, { id: 'b', title: 'Barbie' }, { id: 'c', title: 'Dune' }];
const ratings = [
  { movie_id: 'a', profile_id: 'me', v: 7 },
  { movie_id: 'a', profile_id: 'jane', v: 9.5 },
  { movie_id: 'a', profile_id: 'lala', v: 9.5 },
  { movie_id: 'b', profile_id: 'marie', v: 4 },
  { movie_id: 'c', profile_id: 'jane', v: 8 },
];

test('qui a noté : on ne devine jamais ses propres notes', () => {
  const candidates = whoCandidates(movies, ratings, people, 'me');
  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((r) => r.profile_id !== 'me'));
  for (const q of buildWhoQuestions(movies, ratings, people, 'me')) {
    assert.notEqual(q.answer.id, 'me');
    assert.ok(q.options.some((p) => p.id === q.answer.id));
    assert.equal(new Set(q.options.map((p) => p.id)).size, q.options.length);
  }
});

test('qui a noté : deux membres à la même note ont raison tous les deux', () => {
  const q = buildWhoQuestions(movies, ratings, people, 'me').find((x) => x.movie.id === 'a');
  assert.ok(isWhoRight(q, 'jane'));
  assert.ok(isWhoRight(q, 'lala'));
  assert.ok(!isWhoRight(q, 'me'));
});

test('qui a noté : la façon de noter se lit par rapport au groupe', () => {
  const tastes = memberTastes(ratings);
  assert.equal(tastes.get('jane').lean, 'large');
  assert.equal(tastes.get('marie').lean, 'severe');
  assert.equal(tastes.get('jane').count, 2);
});
