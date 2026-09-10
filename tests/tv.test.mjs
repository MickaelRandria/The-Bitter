import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Charge un module TypeScript de l'application, ses dépendances relatives
 * comprises.
 *
 * Ces modules sont purs : ils ne touchent ni au DOM, ni au réseau, ni à
 * `localStorage`. Les transpiler et les exécuter dans un `require` maison évite
 * d'installer un lanceur de tests entier pour vérifier quatre fonctions de
 * calcul — et surtout, ce sont bien les fichiers livrés qui sont testés, pas une
 * copie de leur logique.
 */
const cache = new Map();
function load(relative, from = import.meta.url) {
  const url = new URL(relative.endsWith('.ts') ? relative : `${relative}.ts`, from);
  if (cache.has(url.href)) return cache.get(url.href);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  cache.set(url.href, exports);
  new Function('exports', 'require', compiled)(exports, (id) => load(id, url));
  return exports;
}

const { updateEpisode, episodeAverage, episodeKey } = load('../utils/tvProgress.ts');
const { seasonScores, getSeriesRating } = load('../utils/rating.ts');
const { parseBackup } = load('../utils/dataBackup.ts');

const entry = { seasonNumber: 1, episodeNumber: 1, watched: false, updatedAt: 10 };
const season = (seasonNumber, ratings) => ({
  id: `s${seasonNumber}`,
  mediaType: 'tv',
  seasonNumber,
  status: 'watched',
  dateWatched: 1,
  ratings,
});

test('a zero is a rating; unnoted episodes do not dilute the average', () => {
  assert.deepEqual(
    episodeAverage(
      [
        { ...entry, rating: 0 },
        { ...entry, episodeNumber: 2, rating: 8 },
        { ...entry, episodeNumber: 3 },
        { ...entry, seasonNumber: 2, rating: 10 },
      ],
      1
    ),
    { count: 2, average: 4 }
  );
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
  const progress = {
    state: 'watching',
    seasonsWatched: [1, 2],
    episodes: { '2:1': { ...entry, seasonNumber: 2, rating: 9 } },
    updatedAt: 0,
  };
  const changed = updateEpisode(progress, entry);
  assert.deepEqual(changed.seasonsWatched, [2]);
  assert.equal(changed.episodes['2:1'].rating, 9);
  assert.deepEqual(progress.seasonsWatched, [1, 2]);
  assert.notEqual(episodeKey(0, 1), episodeKey(1, 1));
});

test('the two season scores stay separate, and the verdict represents the season', () => {
  const entries = [
    { ...entry, rating: 6 },
    { ...entry, episodeNumber: 2, rating: 9 },
  ];
  const withVerdict = seasonScores(
    season(1, { story: 8, visuals: 8, acting: 8, sound: 8 }),
    entries,
    1
  );
  assert.deepEqual(withVerdict, { episodes: { average: 7.5, count: 2 }, global: 8, overall: 8 });

  // Sans verdict, la moyenne des épisodes représente la saison plutôt que rien.
  const withoutVerdict = seasonScores(undefined, entries, 1);
  assert.deepEqual(withoutVerdict, { episodes: { average: 7.5, count: 2 }, global: null, overall: 7.5 });

  // Une saison ni notée ni regardée n'invente pas de zéro.
  assert.deepEqual(seasonScores(undefined, [], 1), { episodes: null, global: null, overall: null });
});

test('a season rated only episode by episode still counts in the series rating', () => {
  const progress = {
    state: 'watching',
    updatedAt: 0,
    episodes: {
      '2:1': { ...entry, seasonNumber: 2, rating: 6 },
      '2:2': { ...entry, seasonNumber: 2, episodeNumber: 2, rating: 8 },
    },
  };
  // Saison 1 notée d'un verdict à 9, saison 2 seulement par ses épisodes (7).
  const rating = getSeriesRating([season(1, { story: 9, visuals: 9, acting: 9, sound: 9 })], progress);
  assert.deepEqual(rating, { average: 8, ratedSeasons: 2 });

  // Sans progression, seule la saison au verdict compte : rien n'est inventé.
  assert.deepEqual(getSeriesRating([season(1, { story: 9, visuals: 9, acting: 9, sound: 9 })]), {
    average: 9,
    ratedSeasons: 1,
  });
  assert.equal(getSeriesRating([]), null);
});

const backup = (episode) => ({
  schema: 'the-bitter-backup',
  version: 2,
  exportedAt: '2026-09-10',
  preferences: {},
  profile: {
    id: 'test',
    firstName: 'Test',
    lastName: '',
    createdAt: 0,
    movies: [
      {
        id: 'series',
        title: 'Series',
        director: '',
        year: 2026,
        genre: 'Drama',
        status: 'watchlist',
        dateAdded: 0,
        ratings: { story: 0, visuals: 0, acting: 0, sound: 0 },
        tvProgress: { state: 'watching', updatedAt: 10, episodes: { '1:1': episode } },
      },
    ],
  },
});

test('backup round trip preserves episode zero, optional dates and the rating grid', () => {
  const graded = {
    ...entry,
    rating: 0,
    ratingMode: 'bitter_plus',
    adaptiveRating: {
      profile: { id: 'thriller', label: 'Thriller', version: 1 },
      criteria: [{ key: 'scenario', label: 'Scénario', value: 0, weight: 1.4 }],
      weightedRating: 0,
    },
  };
  const parsed = parseBackup(JSON.parse(JSON.stringify(backup(graded))));
  assert.ok(parsed);
  const restored = parsed.profile.movies[0].tvProgress.episodes['1:1'];
  assert.equal(restored.rating, 0);
  assert.equal(restored.watchedAt, undefined);
  assert.equal(restored.ratingMode, 'bitter_plus');
  assert.equal(restored.adaptiveRating.criteria[0].key, 'scenario');
});

test('malformed episode entries do not enter the local library through backup', () => {
  const invalids = [
    { ...entry, rating: 11 },
    { ...entry, episodeNumber: -1 },
    { ...entry, watched: 'yes' },
    { ...entry, review: {} },
    { ...entry, ratingMode: 'bitter_ultra' },
    { ...entry, adaptiveRating: { weightedRating: 8, criteria: 'nope' } },
    { ...entry, adaptiveRating: { weightedRating: 42, criteria: [] } },
  ];
  for (const invalid of invalids) assert.equal(parseBackup(backup(invalid)), null);
});
