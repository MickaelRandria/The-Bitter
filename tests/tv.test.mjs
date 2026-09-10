import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Ces modules sont purs et n'importent que des types : ni l'application ni le
// navigateur n'ont besoin d'exister pour les exécuter.
function load(relative) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', compiled)(exports);
  return exports;
}
const { updateEpisode, episodeAverage, episodeKey } = load('../utils/tvProgress.ts');
const { parseBackup } = load('../utils/dataBackup.ts');
const entry = { seasonNumber: 1, episodeNumber: 1, watched: false, updatedAt: 10 };

test('a zero is a rating; unnoted episodes do not dilute the average', () => {
  assert.deepEqual(episodeAverage([{ ...entry, rating: 0 }, { ...entry, episodeNumber: 2, rating: 8 }, { ...entry, episodeNumber: 3 }, { ...entry, seasonNumber: 2, rating: 10 }], 1), { count: 2, average: 4 });
  assert.equal(episodeAverage([entry], 1), null);
});
test('rating does not mark an episode or a series as watched', () => {
  const progress = updateEpisode({ state: 'planned', updatedAt: 0 }, { ...entry, rating: 8 });
  assert.equal(progress.state, 'planned');
  assert.equal(progress.episodes['1:1'].watched, false);
});
test('watching the first episode starts a planned series without completing it', () => {
  assert.equal(updateEpisode({ state: 'planned', updatedAt: 0 }, { ...entry, watched: true }).state, 'watching');
});
test('editing an episode keeps other seasons and episodes', () => {
  const progress = { state: 'watching', seasonsWatched: [1, 2], episodes: { '2:1': { ...entry, seasonNumber: 2, rating: 9 } }, updatedAt: 0 };
  const changed = updateEpisode(progress, entry);
  assert.deepEqual(changed.seasonsWatched, [2]);
  assert.equal(changed.episodes['2:1'].rating, 9);
  assert.deepEqual(progress.seasonsWatched, [1, 2]);
  assert.notEqual(episodeKey(0, 1), episodeKey(1, 1));
});
const backup = (episode) => ({ schema: 'the-bitter-backup', version: 2, exportedAt: '2026-09-10', preferences: {}, profile: { id: 'test', firstName: 'Test', lastName: '', createdAt: 0, movies: [{ id: 'series', title: 'Series', director: '', year: 2026, genre: 'Drama', status: 'watchlist', dateAdded: 0, ratings: { story: 0, visuals: 0, acting: 0, sound: 0 }, tvProgress: { state: 'watching', updatedAt: 10, episodes: { '1:1': episode } } }] } });
test('backup round trip preserves episode zero and optional dates', () => {
  const parsed = parseBackup(JSON.parse(JSON.stringify(backup({ ...entry, rating: 0 }))));
  assert.ok(parsed);
  assert.equal(parsed.profile.movies[0].tvProgress.episodes['1:1'].rating, 0);
  assert.equal(parsed.profile.movies[0].tvProgress.episodes['1:1'].watchedAt, undefined);
});
test('malformed episode entries do not enter the local library through backup', () => {
  for (const invalid of [{ ...entry, rating: 11 }, { ...entry, episodeNumber: -1 }, { ...entry, watched: 'yes' }, { ...entry, review: {} }]) assert.equal(parseBackup(backup(invalid)), null);
});
