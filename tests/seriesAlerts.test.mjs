import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** La logique de la fonction Edge `series-alerts`, transpilée telle quelle. */
function load(relative) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, () => ({}));
  return exports;
}

const { seriesAlerts, addDays, parisToday } = load('../supabase/functions/series-alerts/logic.ts');

const today = '2026-10-08';

test('a weekly episode airing today is an episode alert', () => {
  const alerts = seriesAlerts(
    {
      id: 1,
      next_episode_to_air: { air_date: today, season_number: 5, episode_number: 3 },
      seasons: [{ season_number: 5, air_date: '2026-09-24' }],
    },
    today
  );
  assert.deepEqual(alerts, [{ kind: 'tv_episode', season: 5, episode: 3, airDate: today }]);
});

test('a season dropped all at once is a season alert, not its last episode', () => {
  // Netflix : tous les épisodes datés du même jour, TMDB range le dernier dans last_episode_to_air.
  const alerts = seriesAlerts(
    {
      id: 2,
      last_episode_to_air: { air_date: today, season_number: 3, episode_number: 8 },
      next_episode_to_air: null,
      seasons: [{ season_number: 0, air_date: today }, { season_number: 3, air_date: today }],
    },
    today
  );
  assert.deepEqual(alerts, [{ kind: 'tv_season', season: 3, episode: 1, airDate: today }]);
});

test('a premiere episode is a season alert even without a season date', () => {
  const alerts = seriesAlerts({ id: 3, next_episode_to_air: { air_date: today, season_number: 28, episode_number: 1 } }, today);
  assert.deepEqual(alerts, [{ kind: 'tv_season', season: 28, episode: 1, airDate: today }]);
});

test('a season starting in three days is announced once, three days before', () => {
  const soon = addDays(today, 3);
  assert.equal(soon, '2026-10-11');
  const series = { id: 4, next_episode_to_air: { air_date: soon, season_number: 2, episode_number: 1 } };
  assert.deepEqual(seriesAlerts(series, today), [{ kind: 'tv_season_soon', season: 2, episode: 1, airDate: soon }]);
  assert.deepEqual(seriesAlerts(series, addDays(today, 1)), []);
});

test('specials and quiet days say nothing', () => {
  assert.deepEqual(
    seriesAlerts({ id: 5, next_episode_to_air: { air_date: today, season_number: 0, episode_number: 4 } }, today),
    []
  );
  assert.deepEqual(seriesAlerts({ id: 6, status: 'Ended', seasons: [{ season_number: 1, air_date: '2020-01-01' }] }, today), []);
});

test('dates cross months and follow Paris time', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  // 23 h 30 UTC le 7 octobre, c'est déjà le 8 à Paris.
  assert.equal(parisToday(new Date('2026-10-07T23:30:00Z')), '2026-10-08');
});
