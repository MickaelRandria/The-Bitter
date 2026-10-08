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

const { withRatingRevision, ratingOf, firstRating, RATING_HISTORY_LIMIT } = load('../utils/ratingHistory.ts');

const AT = '2026-10-08T10:00:00.000Z';
const legacy = (story, visuals, acting, sound) => ({ status: 'watched', ratings: { story, visuals, acting, sound } });
const adaptive = (profileId, weightedRating) => ({
  status: 'watched',
  ratings: { story: weightedRating, visuals: weightedRating, acting: weightedRating, sound: weightedRating },
  adaptiveRating: { profile: { id: profileId }, criteria: [], weightedRating },
});

test('une note changée rejoint l’historique, avec son profil', () => {
  const history = withRatingRevision(adaptive('drama', 8.2), adaptive('drama', 7), AT);
  assert.deepEqual(history, [{ rating: 8.2, profileId: 'drama', replacedAt: AT }]);
});

test('rouvrir et enregistrer sans rien changer ne crée pas d’entrée', () => {
  assert.equal(withRatingRevision(adaptive('drama', 8.2), adaptive('drama', 8.2), AT), undefined);
});

test('une note d’avant Bitter+ rouverte en Standard, même moyenne : rien à archiver', () => {
  assert.equal(withRatingRevision(legacy(8, 10, 7, 9), adaptive('standard', 8.5), AT), undefined);
});

test('changer seulement de profil est un changement d’avis', () => {
  const history = withRatingRevision(adaptive('action', 8), adaptive('drama', 8), AT);
  assert.equal(history.length, 1);
  assert.equal(history[0].profileId, 'action');
});

test('un film « à voir » qu’on note n’a pas de note à remplacer', () => {
  const watchlist = { status: 'watchlist', ratings: { story: 0, visuals: 0, acting: 0, sound: 0 } };
  assert.equal(withRatingRevision(watchlist, adaptive('drama', 7), AT), undefined);
});

test('l’historique s’allonge dans l’ordre et garde la première note au-delà de la limite', () => {
  let movie = { ...adaptive('drama', 1), ratingHistory: undefined };
  for (let i = 2; i <= RATING_HISTORY_LIMIT + 5; i++) {
    const next = adaptive('drama', i % 10 || 10);
    movie = { ...next, ratingHistory: withRatingRevision(movie, next, AT) };
  }
  assert.equal(movie.ratingHistory.length, RATING_HISTORY_LIMIT);
  assert.equal(firstRating(movie).rating, 1);
});

test('ratingOf : moyenne au dixième en ancienne notation, rien pour un film non noté', () => {
  assert.equal(ratingOf(legacy(8, 10, 7, 9)), 8.5);
  assert.equal(ratingOf(legacy(0, 0, 0, 0)), null);
});
