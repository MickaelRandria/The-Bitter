import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Transpile et exécute le module livré, comme `tests/upNext.test.mjs`. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { watchPace, finishDate, catchUp, episodesThatFit, seasonMoments } = load('../utils/seriesInsights.ts');

const seen = (...dates) => ({
  state: 'watching',
  updatedAt: 1,
  episodes: Object.fromEntries(
    dates.map((watchedAt, i) => [`1:${i + 1}`, { seasonNumber: 1, episodeNumber: i + 1, watched: true, watchedAt, updatedAt: 1 }])
  ),
});

test('no pace from a single dated episode', () => {
  assert.equal(watchPace(seen('2026-09-29'), '2026-10-01'), null);
});

test('one episode a day reads as one a day', () => {
  const pace = watchPace(seen('2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'), '2026-10-01');
  assert.equal(pace, 1);
});

test('a single binge night does not promise the end of the season tomorrow', () => {
  const pace = watchPace(seen('2026-10-01', '2026-10-01', '2026-10-01'), '2026-10-01');
  assert.equal(pace, 1); // trois épisodes ramenés à trois jours au moins
});

test('episodes older than four weeks no longer count', () => {
  assert.equal(watchPace(seen('2026-08-01', '2026-08-02', '2026-08-03'), '2026-10-01'), null);
});

test('finish date at the current pace, or nothing when it is too far', () => {
  assert.equal(finishDate(6, 0.5, '2026-10-01'), '2026-10-13');
  assert.equal(finishDate(6, 0.01, '2026-10-01'), null);
  assert.equal(finishDate(0, 1, '2026-10-01'), null);
  assert.equal(finishDate(4, null, '2026-10-01'), null);
});

test('catch up before an announced next season', () => {
  const seasons = [
    { seasonNumber: 1, airDate: '2024-01-01' },
    { seasonNumber: 2, airDate: '2025-01-01' },
    { seasonNumber: 3, airDate: '2026-10-13' },
  ];
  assert.deepEqual(catchUp(seasons, 2, 8, '2026-10-01'), { season: 3, days: 12, episodes: 8 });
  assert.equal(catchUp(seasons, 2, 0, '2026-10-01'), null);
  assert.equal(catchUp([{ seasonNumber: 1 }, { seasonNumber: 2, airDate: '2027-06-01' }], 1, 4, '2026-10-01'), null);
});

test('what fits tonight', () => {
  const episodes = [
    { episodeNumber: 3, airDate: '2026-09-01', runtime: 30 },
    { episodeNumber: 4, airDate: '2026-09-08', runtime: 28 },
    { episodeNumber: 5, airDate: '2026-09-15' },
    { episodeNumber: 6, airDate: '2026-12-01', runtime: 20 },
  ];
  assert.deepEqual(episodesThatFit(episodes, 3, 45, '2026-10-01'), { count: 1, minutes: 30 });
  assert.deepEqual(episodesThatFit(episodes, 3, 60, '2026-10-01'), { count: 2, minutes: 58 });
  // L'épisode 5 n'a pas de durée : compté 45 minutes. Le 6 n'est pas sorti.
  assert.deepEqual(episodesThatFit(episodes, 3, 240, '2026-10-01'), { count: 3, minutes: 103 });
  assert.deepEqual(episodesThatFit(episodes, 3, 20, '2026-10-01'), { count: 0, minutes: 0 });
});

test('the most 😱 episode of the season is the best rated one with that reaction', () => {
  const entries = [
    { seasonNumber: 1, episodeNumber: 2, watched: true, reactions: ['shock'], rating: 7, updatedAt: 1 },
    { seasonNumber: 1, episodeNumber: 7, watched: true, reactions: ['shock', 'fire'], rating: 9, updatedAt: 1 },
    { seasonNumber: 1, episodeNumber: 4, watched: true, reactions: ['cry'], updatedAt: 1 },
    { seasonNumber: 2, episodeNumber: 1, watched: true, reactions: ['laugh'], rating: 10, updatedAt: 1 },
  ];
  assert.deepEqual(seasonMoments(entries, 1), [
    { reaction: 'shock', episode: 7, rating: 9 },
    { reaction: 'fire', episode: 7, rating: 9 },
    { reaction: 'cry', episode: 4, rating: undefined },
  ]);
});
