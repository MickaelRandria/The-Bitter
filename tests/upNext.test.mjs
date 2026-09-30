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

const { furthestPosition, nextEpisode, remainingInSeason, formatDuration } = load('../utils/upNext.ts');

const seasons = [
  { seasonNumber: 0, episodeCount: 3 },
  { seasonNumber: 1, episodeCount: 8 },
  { seasonNumber: 2, episodeCount: 10 },
];
const watched = (seasonNumber, episodeNumber) => ({
  [`${seasonNumber}:${episodeNumber}`]: { seasonNumber, episodeNumber, watched: true, updatedAt: 1 },
});
const progress = (extra) => ({ state: 'watching', updatedAt: 1, ...extra });

test('a series never started begins at season 1, episode 1, not at the specials', () => {
  assert.deepEqual(nextEpisode(progress({}), seasons), { season: 1, episode: 1 });
  assert.deepEqual(nextEpisode(undefined, seasons), { season: 1, episode: 1 });
});

test('the next episode follows the furthest one, not the latest one checked', () => {
  const p = progress({ episodes: { ...watched(2, 3), ...watched(1, 2) } });
  assert.deepEqual(nextEpisode(p, seasons), { season: 2, episode: 4 });
});

test('the end of a season leads to the first episode of the next one', () => {
  assert.deepEqual(nextEpisode(progress({ episodes: watched(1, 8) }), seasons), { season: 2, episode: 1 });
  assert.deepEqual(nextEpisode(progress({ seasonsWatched: [1] }), seasons), { season: 2, episode: 1 });
});

test('being caught up with everything TMDB knows means no next episode', () => {
  assert.equal(nextEpisode(progress({ seasonsWatched: [1, 2] }), seasons), null);
  assert.equal(nextEpisode(progress({ episodes: watched(2, 10) }), seasons), null);
});

test('the bookmark names the episode to resume, so the one before counts as seen', () => {
  const p = progress({ lastSeason: 2, lastEpisode: 4 });
  assert.deepEqual(furthestPosition(p, seasons), { season: 2, episode: 3 });
  assert.deepEqual(nextEpisode(p, seasons), { season: 2, episode: 4 });
  // « Reprendre à l'épisode 1 » : rien de la saison n'est vu.
  assert.deepEqual(nextEpisode(progress({ lastSeason: 2, lastEpisode: 1 }), seasons), { season: 2, episode: 1 });
});

test('an unchecked episode is not progress, and specials never are', () => {
  const p = progress({
    episodes: {
      '1:5': { seasonNumber: 1, episodeNumber: 5, watched: false, updatedAt: 1 },
      ...watched(0, 2),
      ...watched(1, 1),
    },
  });
  assert.deepEqual(nextEpisode(p, seasons), { season: 1, episode: 2 });
});

test('what is left counts only aired episodes', () => {
  const episodes = [
    { episodeNumber: 3, airDate: '2026-09-01', runtime: 50 },
    { episodeNumber: 4, airDate: '2026-09-08', runtime: 55 },
    { episodeNumber: 5, airDate: '2026-10-06', runtime: 50 },
    { episodeNumber: 6 },
  ];
  assert.deepEqual(remainingInSeason(episodes, 3, '2026-09-30'), { count: 2, minutes: 105 });
});

test('durations read as an estimate', () => {
  assert.equal(formatDuration(47), '45 min');
  assert.equal(formatDuration(262), '4 h 20');
  assert.equal(formatDuration(118), '2 h');
  assert.equal(formatDuration(2), '5 min');
});
