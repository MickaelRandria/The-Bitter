import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Transpile et exécute le module livré, comme `tests/upNext.test.mjs`, en
 * chargeant aussi ses imports relatifs : `episodeCompanion.ts` s'appuie sur
 * `upNext.ts` et `tvProgress.ts`.
 */
function load(relative, base = import.meta.url, cache = new Map()) {
  const url = new URL(relative.endsWith('.ts') ? relative : `${relative}.ts`, base);
  if (cache.has(url.href)) return cache.get(url.href);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  cache.set(url.href, exports);
  new Function('exports', 'require', compiled)(exports, (spec) =>
    spec.startsWith('.') ? load(spec, url, cache) : {}
  );
  return exports;
}

const { markEpisodeWatched, progressFromLastSeen } = load('../utils/episodeCompanion.ts');
const { seasonRail, daysUntil, nextEpisode } = load('../utils/upNext.ts');
const { sessionMoment } = load('../utils/episodeSession.ts');

const seasons = [
  { seasonNumber: 0, episodeCount: 3 },
  { seasonNumber: 1, episodeCount: 8 },
  { seasonNumber: 2, episodeCount: 10 },
];
const NOW = Date.parse('2026-09-30T20:00:00');
const MIN = 60_000;

test('marking the next episode moves the bookmark to the one after', () => {
  const progress = markEpisodeWatched({ state: 'watching', updatedAt: 1 }, { season: 1, episode: 3 }, seasons, {
    ended: false,
    runtime: 42,
    now: NOW,
  });
  assert.equal(progress.episodes['1:3'].watched, true);
  assert.equal(progress.episodes['1:3'].runtime, 42);
  assert.equal(progress.episodes['1:3'].watchedAt, '2026-09-30');
  assert.deepEqual([progress.lastSeason, progress.lastEpisode], [1, 4]);
  assert.deepEqual(nextEpisode(progress, seasons), { season: 1, episode: 4 });
});

test('the last episode of a season leads to the first of the next one', () => {
  const progress = markEpisodeWatched(undefined, { season: 1, episode: 8 }, seasons, { ended: false, now: NOW });
  assert.deepEqual([progress.lastSeason, progress.lastEpisode], [2, 1]);
  assert.equal(progress.state, 'watching');
});

test('the very last episode of an ended series completes it', () => {
  const progress = markEpisodeWatched(undefined, { season: 2, episode: 10 }, seasons, { ended: true, now: NOW });
  assert.equal(progress.state, 'completed');
});

test('a quick rating is stored as a global rating, and an older review survives', () => {
  const before = {
    state: 'watching',
    updatedAt: 1,
    episodes: { '1:2': { seasonNumber: 1, episodeNumber: 2, watched: false, review: 'Tendu', updatedAt: 1 } },
  };
  const progress = markEpisodeWatched(before, { season: 1, episode: 2 }, seasons, {
    ended: false,
    extra: { rating: 8, ratingMode: 'global' },
    now: NOW,
  });
  assert.equal(progress.episodes['1:2'].rating, 8);
  assert.equal(progress.episodes['1:2'].ratingMode, 'global');
  assert.equal(progress.episodes['1:2'].review, 'Tendu');
});

test('"seen up to S1 E5" resumes at S1 E6', () => {
  const progress = progressFromLastSeen(undefined, { season: 1, episode: 5 }, seasons, { ended: false, now: NOW });
  assert.deepEqual(nextEpisode(progress, seasons), { season: 1, episode: 6 });
  assert.equal(progress.state, 'watching');
});

test('"seen up to the end of S1" resumes at S2 E1', () => {
  const progress = progressFromLastSeen(undefined, { season: 1, episode: 8 }, seasons, { ended: false, now: NOW });
  assert.deepEqual([progress.lastSeason, progress.lastEpisode], [2, 1]);
  assert.deepEqual(nextEpisode(progress, seasons), { season: 2, episode: 1 });
});

test('"seen everything" of an ended series marks it completed, with nothing next', () => {
  const progress = progressFromLastSeen(undefined, { season: 2, episode: 10 }, seasons, { ended: true, now: NOW });
  assert.equal(progress.state, 'completed');
  assert.equal(nextEpisode(progress, seasons), null);
});

test('"not started yet" follows the series from S1 E1', () => {
  const progress = progressFromLastSeen({ state: 'planned', updatedAt: 1 }, null, seasons, { ended: false, now: NOW });
  assert.equal(progress.state, 'watching');
  assert.deepEqual(nextEpisode(progress, seasons), { season: 1, episode: 1 });
});

test('the season rail tells seen, next, aired and upcoming apart', () => {
  const episodes = [
    { episodeNumber: 3, airDate: '2026-09-20' },
    { episodeNumber: 1, airDate: '2026-09-06' },
    { episodeNumber: 2, airDate: '2026-09-13' },
    { episodeNumber: 4, airDate: '2026-09-27' },
    { episodeNumber: 5, airDate: '2026-10-04' },
    { episodeNumber: 6 },
  ];
  assert.deepEqual(seasonRail(episodes, 3, '2026-09-30'), ['seen', 'seen', 'next', 'aired', 'upcoming', 'upcoming']);
});

test('days until an air date', () => {
  assert.equal(daysUntil('2026-10-01', '2026-09-30'), 1);
  assert.equal(daysUntil('2026-10-07', '2026-09-30'), 7);
  // Le passage à l'heure d'hiver ne décale pas le compte.
  assert.equal(daysUntil('2026-10-26', '2026-10-24'), 2);
});

test('the return question waits for 60% of the episode, and at least ten minutes', () => {
  const session = { seriesId: 's', season: 1, episode: 2, runtime: 50, startedAt: NOW };
  assert.equal(sessionMoment(session, NOW + 20 * MIN), 'watching');
  assert.equal(sessionMoment(session, NOW + 30 * MIN), 'ask');
  const short = { ...session, runtime: 12 };
  assert.equal(sessionMoment(short, NOW + 8 * MIN), 'watching');
  assert.equal(sessionMoment(short, NOW + 10 * MIN), 'ask');
});

test('"not finished yet" snoozes the question, and an old session is forgotten', () => {
  const session = { seriesId: 's', season: 1, episode: 2, runtime: 40, startedAt: NOW, promptedAt: NOW + 30 * MIN };
  assert.equal(sessionMoment(session, NOW + 35 * MIN), 'watching');
  assert.equal(sessionMoment(session, NOW + 46 * MIN), 'ask');
  assert.equal(sessionMoment(session, NOW + 37 * 60 * MIN), 'expired');
});
