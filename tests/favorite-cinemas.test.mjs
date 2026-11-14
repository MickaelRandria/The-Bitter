import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/favoriteCinemas.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('exports', 'require', compiled)(exports, () => ({}));
const { cinemasOf, uniqueFavoriteCinemas, withFavoriteCinemas, cinemasOfRow, buildShowtimeSources, groupShowtimesByDay, nextShowtime, MAX_SHOWTIME_SOURCES } = exports;
const cinema = (id) => ({ id: String(id), name: `Cinema ${id}`, city: 'Paris' });

test('reads legacy profiles, but preserves an explicitly empty list', () => {
  const old = cinema(1);
  assert.deepEqual(cinemasOf({ favoriteCinema: old }), [old]);
  assert.deepEqual(cinemasOf({ favoriteCinema: old, favoriteCinemas: [] }), []);
  assert.deepEqual(cinemasOf(), []);
});

test('deduplicates by id in order and keeps at most five', () => {
  assert.deepEqual(uniqueFavoriteCinemas([1, 2, 1, 3, 4, 5, 6].map(cinema)).map(c => c.id), ['1', '2', '3', '4', '5']);
});

test('writes both fields together, the first cinema staying the legacy one', () => {
  const next = withFavoriteCinemas({ favoriteCinema: cinema(9) }, [cinema(2), cinema(3)]);
  assert.equal(next.favoriteCinema.id, '2');
  assert.deepEqual(next.favoriteCinemas.map((c) => c.id), ['2', '3']);
  const cleared = withFavoriteCinemas({ favoriteCinema: cinema(9) }, []);
  assert.equal('favoriteCinema' in cleared, false);
  assert.deepEqual(cleared.favoriteCinemas, []);
});

test('reads a server row: list first, legacy column as fallback', () => {
  assert.deepEqual(cinemasOfRow({ favorite_cinemas: [cinema(1), cinema(1), cinema(2)] }).map((c) => c.id), ['1', '2']);
  assert.deepEqual(cinemasOfRow({ favorite_cinemas: null, favorite_cinema: cinema(4) }).map((c) => c.id), ['4']);
  assert.equal(cinemasOfRow({ favorite_cinemas: null, favorite_cinema: null }), undefined);
  assert.equal(cinemasOfRow(null), undefined);
});

test('mine first, theirs after with who follows them, shared ones stay mine', () => {
  const sources = buildShowtimeSources([cinema(1), cinema(2)], [
    { name: 'Sarah', color: '#f00', cinemas: [cinema(2), cinema(3)] },
    { name: 'Léo', color: '#0f0', cinemas: [cinema(3)] },
  ]);
  assert.deepEqual(sources.map((s) => [s.cinema.id, s.mine, s.followers]), [
    ['1', true, []],
    ['2', true, ['Sarah']],
    ['3', false, ['Sarah', 'Léo']],
  ]);
  assert.equal(sources[2].followerColor, '#f00');
  const many = buildShowtimeSources([1, 2, 3, 4, 5].map(cinema), [{ name: 'A', cinemas: [6, 7, 8, 9, 10].map(cinema) }, { name: 'B', cinemas: [11, 12].map(cinema) }]);
  assert.equal(many.length, MAX_SHOWTIME_SOURCES);
});

test('groups by day, empty days kept, past showtimes dropped, cinemas in order', () => {
  const now = new Date(2026, 10, 14, 15, 0).getTime();
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
  const entry = (cinemaId, startsAt, id = `${cinemaId}-${startsAt}`) => ({ cinemaId, showtime: { id, startsAt, bookingUrl: '' } });
  const entries = [entry('b', at(14, 21, 30)), entry('a', at(14, 20, 15)), entry('a', at(14, 11)), entry('a', at(16, 14, 10))];
  const days = groupShowtimesByDay(entries, ['a', 'b'], now, 7);
  assert.equal(days.length, 7);
  assert.equal(days[0].count, 2);
  assert.deepEqual(days[0].groups.map((g) => g.cinemaId), ['a', 'b']);
  assert.equal(days[0].first, at(14, 20, 15));
  assert.equal(days[0].last, at(14, 21, 30));
  assert.equal(days[1].count, 0);
  assert.equal(days[2].count, 1);
  assert.equal(nextShowtime(entries, now).showtime.startsAt, at(14, 20, 15));
  assert.equal(nextShowtime([], now), null);
});
