import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** cinemaDetail importe cinemaStats : on charge les deux, le second servant le premier. */
function load(relative, stubs = {}) {
  const url = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, (name) => stubs[name] ?? {});
  return exports;
}

const stats = load('../utils/cinemaStats.ts');
const { salleVsCanape, habitsOf, formatEffect, passReality, recordsOf, cinemaCard } = load('../utils/cinemaDetail.ts', { './cinemaStats': stats });

const at = (m, d, h = 20, min = 30) => new Date(2026, m, d, h, min).getTime();
// Jeudis 5, 12 et 19 novembre 2026 ; un samedi à 23 h ; un vendredi à 1 h du matin.
const screenings = [
  { id: 'a', startsAt: at(10, 5), title: 'A', cinemaName: 'UGC', format: 'VOST', tmdbId: 1 },
  { id: 'b', startsAt: at(10, 12), title: 'B', cinemaName: 'UGC', format: 'IMAX VOST', tmdbId: 2, planId: 'p' },
  { id: 'c', startsAt: at(10, 19), title: 'C', cinemaName: 'Champo', format: 'VF', tmdbId: 3 },
  { id: 'd', startsAt: at(10, 21, 23, 0), title: 'D', cinemaName: 'UGC', format: 'VF', tmdbId: 4 },
  { id: 'e', startsAt: at(10, 27, 1, 10), title: 'E', cinemaName: 'Champo', format: 'VOST' },
];
const ratings = new Map([[1, 8], [2, 9], [3, 6], [4, 6]]);
const ratingOf = (id) => ratings.get(id);

test('salles : la salle contre le canapé, à partir de deux films de chaque côté', () => {
  const films = [{ tmdbId: 1, score: 8 }, { tmdbId: 2, score: 9 }, { tmdbId: 9, score: 6 }, { score: 5 }];
  assert.deepEqual(salleVsCanape(films, screenings), { salle: 8.5, canape: 5.5, salleCount: 2, canapeCount: 2 });
  assert.equal(salleVsCanape([{ tmdbId: 1, score: 8 }], screenings), null);
});

test('salles : le jeudi, le créneau, les séances à plusieurs', () => {
  const h = habitsOf(screenings);
  assert.equal(h.topWeekday, 3);
  assert.equal(h.topSlot, 20);
  assert.equal(h.together, 1);
  assert.ok(h.everyDays >= 5 && h.everyDays <= 6);
});

test('salles : la version, le pass, les records, la fiche', () => {
  const effect = formatEffect(screenings, ratingOf);
  assert.deepEqual(effect.map((f) => f.label), ['VOST', 'VF']);
  assert.equal(effect[0].average, 8.5);
  const pass = passReality(screenings, { monthlyPrice: 22.9, referenceTicketPrice: 13, startDate: '2026-01-01' });
  assert.equal(Math.round(pass.perSession * 100), 458);
  assert.equal(Math.round(pass.saved * 10), 421);
  const records = recordsOf(screenings);
  assert.equal(records.latest.id, 'e');
  assert.equal(records.first.id, 'a');
  assert.equal(records.streakWeeks, 4);
  const ugc = cinemaCard('UGC', screenings, ratingOf);
  assert.equal(ugc.count, 3);
  assert.equal(ugc.screenings[0].id, 'd');
  assert.equal(Math.round(ugc.average * 10), 77);
});
