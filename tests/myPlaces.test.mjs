import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = (path, modules) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => modules[name] ?? {});
  return exports;
};

const myPlace = load('../utils/myPlace.ts', {});
const { placesByFilm } = load('../services/myScreenings.ts', {
  react: { useEffect() {}, useMemo: (f) => f(), useState: (v) => [v, () => {}] },
  './screenings': { SCREENINGS_CHANGED: 'x', listUpcomingScreenings: async () => [] },
  '../utils/myPlace': myPlace,
});

const now = new Date(2026, 10, 15, 12, 0).getTime();
const h = 3_600_000;
const row = (id, tmdbId, startsAt, status = 'scheduled') => ({ id, tmdbId, startsAt, status, title: id });

test('une place par film : la prochaine séance, annulées et finies exclues', () => {
  const places = placesByFilm(
    [
      row('hg-later', 101, now + 72 * h),
      row('hg-next', 101, now + 50 * h, 'pending'),
      row('dune-cancelled', 202, now + 5 * h, 'cancelled'),
      row('old', 303, now - 4 * h),
      row('playing', 404, now - 1 * h),
      row('manual', null, now + 2 * h),
    ],
    now
  );
  assert.deepEqual([...places.keys()].sort(), [101, 404]);
  assert.equal(places.get(101).id, 'hg-next');
});

test('le calendrier n’annonce plus la sortie d’un film dont j’ai la place', () => {
  const src = readFileSync(new URL('../components/useCalendarAgenda.ts', import.meta.url), 'utf8');
  assert.match(src, /!\(movie\.tmdbId && booked\.has\(movie\.tmdbId\)\)/);
  assert.match(src, /releases\.filter\(\(film\) => !booked\.has\(film\.id\)\)/);
});
