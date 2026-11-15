import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/cinemaWeek.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ex = {};
new Function('exports', 'require', compiled)(ex, () => ({}));
const { buildCinemaWeek, cinemaWeekStart } = ex;

test('la semaine de cinéma commence le mercredi', () => {
  assert.equal(cinemaWeekStart('2026-11-15'), '2026-11-11'); // dimanche
  assert.equal(cinemaWeekStart('2026-11-11'), '2026-11-11'); // mercredi
  assert.equal(cinemaWeekStart('2026-11-17'), '2026-11-11'); // mardi
  assert.equal(cinemaWeekStart('2026-11-18'), '2026-11-18'); // mercredi suivant : bascule
});

// Données réelles du 15 nov. 2026 (TMDB, sorties en salle France).
const films = [
  { id: 1, title: 'Malfaisante', popularity: 334 },
  { id: 2, title: 'Hope', popularity: 294 },
  { id: 3, title: 'Ramayana', popularity: 139 },
  { id: 4, title: 'Scrooge', popularity: 122 },
  { id: 5, title: 'Obsession', popularity: 74 },
  { id: 6, title: 'Comment braquer une banque', popularity: 63 },
  { id: 7, title: 'Matrix', popularity: 50 },
  { id: 8, title: 'Trop vieux', popularity: 40 },
];
const dates = {
  1: { theatrical: ['2026-10-14'], limited: [] },
  2: { theatrical: ['2026-10-28'], limited: [] },
  3: { theatrical: ['2026-11-06'], limited: [] }, // vendredi : distribution restreinte
  4: { theatrical: ['2026-11-11'], limited: [] },
  5: { theatrical: ['2026-05-13', '2026-10-31'], limited: [] }, // ressortie
  6: { theatrical: ['2026-11-11'], limited: ['2026-11-10'] },
  7: { theatrical: ['1999-06-23', '2026-11-04'], limited: [] }, // classique qui ressort
  8: { theatrical: ['2026-09-30'], limited: [] }, // hors des cinq semaines
};

test('sortis mercredi, puis toujours à l’affiche, sorties limitées en dernier', () => {
  const w = buildCinemaWeek(films, (id) => dates[id], '2026-11-15');
  assert.equal(w.weekStart, '2026-11-11');
  assert.equal(w.weekEnd, '2026-11-17');
  assert.deepEqual(w.week.map((f) => f.title), ['Scrooge', 'Comment braquer une banque']);
  assert.deepEqual(w.still.map((f) => f.title), ['Malfaisante', 'Hope', 'Obsession', 'Ramayana']);
  const by = Object.fromEntries(w.still.map((f) => [f.title, f]));
  assert.equal(by.Malfaisante.weekOn, 5);
  assert.equal(by.Hope.weekOn, 3);
  assert.equal(by.Obsession.rerelease, true);
  assert.equal(by.Obsession.limited, false);
  assert.equal(by.Ramayana.limited, true);
});

test('le mercredi suivant, les sorties de la semaine passent « 2e semaine »', () => {
  const w = buildCinemaWeek(films, (id) => dates[id], '2026-11-18');
  assert.deepEqual(w.week, []);
  const scrooge = w.still.find((f) => f.title === 'Scrooge');
  assert.equal(scrooge.weekOn, 2);
});
