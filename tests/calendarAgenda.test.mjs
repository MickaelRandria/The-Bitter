import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../utils/calendarAgenda.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const {
  calendarDay,
  calendarHistory,
  calendarYear,
  shiftCalendarDay,
  daysUntil,
  mergeCalendarEvents,
  majorCalendarReleases,
  filterCalendarDays,
  isRemovableSession,
} = exports;
const ratings = { story: 6, visuals: 8, acting: 7, sound: 7 };
const movie = (over = {}) => ({
  id: 'film',
  status: 'watched',
  ratings,
  dateWatched: Date.parse('2026-10-08T20:00:00Z'),
  ...over,
});

test('un visionnage proche de minuit se range au jour de Paris', () => {
  assert.equal(calendarDay('2026-10-08T22:30:00Z'), '2026-10-09');
  assert.equal(calendarDay('invalide'), '');
  assert.equal(shiftCalendarDay('2026-03-28', 1), '2026-03-29');
  assert.equal(daysUntil('2026-03-30', '2026-03-28'), 2);
});
test('les rewatches gardent leur date et leur note, sans doubler la dernière séance', () => {
  const watches = [
    { id: 'a', watched_at: '2026-01-04', ratings },
    { id: 'b', watched_at: '2026-10-08', ratings, adaptiveRating: { weightedRating: 9.1 } },
  ];
  const entries = calendarHistory([movie({ watches: [...watches, watches[1]] })]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].day, '2026-01-04');
  assert.equal(entries[1].rating, 9.1);
  assert.equal(
    calendarHistory([movie({ status: 'watchlist' }), movie({ mediaType: 'tv' })]).length,
    0
  );
});
test('les historiques anciens et les notes à zéro restent lisibles', () => {
  assert.equal(calendarHistory([movie()])[0].rating, 7);
  assert.equal(calendarHistory([movie({ adaptiveRating: { weightedRating: 0 } })])[0].rating, 0);
  assert.equal(calendarHistory([movie({ dateWatched: NaN })]).length, 0);
});
test('la heatmap distingue les jours absents et les années bissextiles', () => {
  assert.equal(calendarYear([], 2024).heatmap[1][28].day, '2024-02-29');
  assert.equal(calendarYear([], 2026).heatmap[1][28], null);
  const history = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    movieId: 'film',
    day: '2026-10-08',
    rating: 5 + i,
  }));
  const year = calendarYear(history, 2026);
  assert.equal(year.heatmap[9][7].intensity, 3);
  assert.equal(year.heatmap[9][7].count, 4);
  assert.equal(year.best[9].rating, 8);
});
test('les records comptent les séances mais la série compte les jours distincts', () => {
  const history = ['2026-01-30', '2026-01-31', '2026-01-31', '2026-02-01', '2025-12-01'].map(
    (day, i) => ({ id: String(i), movieId: 'film', day, rating: i })
  );
  const year = calendarYear(history, 2026);
  assert.equal(year.total, 4);
  assert.equal(year.longestStreak, 3);
  assert.equal(year.bestMonth, 0);
  assert.equal(year.favoriteWeekday, 5);
  assert.equal(calendarYear([], 2026).favoriteWeekday, null);
});
test('les séances passent avant les propositions et la liste avant les grosses sorties', () => {
  const base = { day: '2026-10-10', title: 'Film' };
  const events = [
    { ...base, id: 'a', kind: 'plan', planId: 'p', startsAt: 1 },
    { ...base, id: 'b', kind: 'screening', planId: 'p', startsAt: 1 },
    { ...base, id: 'c', kind: 'release', tmdbId: 10 },
    { ...base, id: 'd', kind: 'watchlist-release', tmdbId: 10 },
  ];
  assert.deepEqual(
    mergeCalendarEvents(events)
      .get(base.day)
      .map((e) => e.id),
    ['b', 'd']
  );
  assert.equal(events.length, 4);
});
test('les grosses sorties gardent les trois mois et suivent la popularité', () => {
  const films = [
    { id: 1, releaseDate: '2026-10-08', popularity: 1 },
    { id: 2, releaseDate: '2026-11-01', popularity: 10 },
    { id: 3, releaseDate: '2027-02-01', popularity: 100 },
    { id: 4, releaseDate: '2026-10-07', popularity: 100 },
  ];
  assert.deepEqual(
    majorCalendarReleases([...films, films[1]], '2026-10-08').map((f) => f.id),
    [2, 1]
  );
  assert.equal(films[0].id, 1);
});

test('un filtre garde une famille entière et retire les jours vides', () => {
  const days = new Map([
    ['2026-10-01', [{ id: 'a', kind: 'watched' }, { id: 'b', kind: 'screening' }]],
    ['2026-10-02', [{ id: 'c', kind: 'release' }]],
    ['2026-10-03', [{ id: 'd', kind: 'plan' }, { id: 'e', kind: 'watchlist-release' }]],
  ]);
  const ids = (m) => [...m].map(([d, ev]) => `${d}:${ev.map((e) => e.id).join('')}`);
  assert.deepEqual(ids(filterCalendarDays(days, 'all')), ['2026-10-01:ab', '2026-10-02:c', '2026-10-03:de']);
  assert.deepEqual(ids(filterCalendarDays(days, 'watched')), ['2026-10-01:a']);
  assert.deepEqual(ids(filterCalendarDays(days, 'sessions')), ['2026-10-01:b', '2026-10-03:d']);
  assert.deepEqual(ids(filterCalendarDays(days, 'releases')), ['2026-10-02:c', '2026-10-03:e']);
});

test('seules les séances à venir où l’on est se retirent', () => {
  const today = '2026-10-08';
  assert.equal(isRemovableSession({ kind: 'screening', day: '2026-10-09' }, today), true);
  assert.equal(isRemovableSession({ kind: 'screening', day: '2026-10-07' }, today), false);
  assert.equal(isRemovableSession({ kind: 'plan', day: '2026-10-10', ownPlan: true }, today), true);
  assert.equal(isRemovableSession({ kind: 'plan', day: '2026-10-10', joined: true }, today), true);
  assert.equal(isRemovableSession({ kind: 'plan', day: '2026-10-10' }, today), false);
  assert.equal(isRemovableSession({ kind: 'release', day: '2026-10-10' }, today), false);
});
